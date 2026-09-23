#include "net/HttpClient.h"

#include <atomic>
#include <mutex>
#include <thread>
#include <vector>

#if defined(IBM)
  #include <windows.h>
  #include <winhttp.h>
  #pragma comment(lib, "winhttp.lib")
#endif

namespace xefb {

namespace {

struct Pending {
    HttpClient::Callback cb;
    HttpClient::Response  resp;
};

std::mutex                 gMx;
std::vector<Pending>       gDone;       // completed, awaiting main-thread delivery
std::vector<std::thread>   gThreads;
std::atomic<bool>          gStop{false};

void finish(HttpClient::Callback cb, HttpClient::Response r) {
    std::lock_guard<std::mutex> lk(gMx);
    gDone.push_back({ std::move(cb), std::move(r) });
}

#if defined(IBM)

std::wstring widen(const std::string& s) {
    if (s.empty()) return {};
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
    return w;
}

HttpClient::Response doRequest(const std::string& method, const std::string& url,
                               const std::string& headers, const std::string& body) {
    HttpClient::Response out;

    URL_COMPONENTS uc{};
    uc.dwStructSize = sizeof uc;
    wchar_t host[256] = {0}, path[2048] = {0};
    uc.lpszHostName = host; uc.dwHostNameLength = 255;
    uc.lpszUrlPath = path;  uc.dwUrlPathLength  = 2047;
    std::wstring wurl = widen(url);
    if (!WinHttpCrackUrl(wurl.c_str(), 0, 0, &uc)) { out.error = "bad url"; return out; }

    HINTERNET session = WinHttpOpen(L"xEFB/1.0",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session) { out.error = "WinHttpOpen failed"; return out; }
    WinHttpSetTimeouts(session, 8000, 8000, 15000, 15000);

    HINTERNET conn = WinHttpConnect(session, host, uc.nPort, 0);
    HINTERNET req = conn ? WinHttpOpenRequest(conn, widen(method).c_str(), path, nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
        (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0) : nullptr;

    if (req) {
        std::wstring wheaders = widen(headers);
        BOOL ok = WinHttpSendRequest(req,
            wheaders.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : wheaders.c_str(),
            (DWORD)-1L,
            body.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)body.data(),
            (DWORD)body.size(), (DWORD)body.size(), 0);
        ok = ok && WinHttpReceiveResponse(req, nullptr);

        if (ok) {
            DWORD code = 0, len = sizeof code;
            WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                WINHTTP_HEADER_NAME_BY_INDEX, &code, &len, WINHTTP_NO_HEADER_INDEX);
            out.status = (long)code;

            DWORD avail = 0;
            do {
                avail = 0;
                if (!WinHttpQueryDataAvailable(req, &avail)) break;
                if (!avail) break;
                std::string chunk(avail, 0);
                DWORD read = 0;
                if (!WinHttpReadData(req, &chunk[0], avail, &read)) break;
                out.body.append(chunk.data(), read);
            } while (avail > 0);
        } else {
            out.error = "request failed (" + std::to_string(GetLastError()) + ")";
        }
    } else {
        out.error = "WinHttpConnect/OpenRequest failed";
    }

    if (req) WinHttpCloseHandle(req);
    if (conn) WinHttpCloseHandle(conn);
    if (session) WinHttpCloseHandle(session);
    return out;
}

#else // ---- non-Windows stub ----

HttpClient::Response doRequest(const std::string&, const std::string& url,
                               const std::string&, const std::string&) {
    HttpClient::Response out;
    out.error = "HttpClient not implemented on this platform yet (add libcurl "
                "in HttpClient.cpp). url=" + url;
    return out;
}

#endif

void launch(const std::string& method, const std::string& url,
            const std::string& headers, const std::string& body,
            HttpClient::Callback cb) {
    std::lock_guard<std::mutex> lk(gMx);
    gThreads.emplace_back([=]() {
        if (gStop) return;
        finish(cb, doRequest(method, url, headers, body));
    });
}

} // namespace

void HttpClient::get(const std::string& url, const std::string& headers, Callback cb) {
    launch("GET", url, headers, {}, std::move(cb));
}
void HttpClient::post(const std::string& url, const std::string& headers,
                      const std::string& body, Callback cb) {
    launch("POST", url, headers, body, std::move(cb));
}

void HttpClient::poll() {
    std::vector<Pending> ready;
    {
        std::lock_guard<std::mutex> lk(gMx);
        ready.swap(gDone);
    }
    for (auto& p : ready) if (p.cb) p.cb(p.resp);
}

void HttpClient::shutdown() {
    gStop = true;
    std::vector<std::thread> ts;
    { std::lock_guard<std::mutex> lk(gMx); ts.swap(gThreads); }
    for (auto& t : ts) if (t.joinable()) t.join();
}

} // namespace xefb
