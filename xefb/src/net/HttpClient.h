#pragma once
#include <functional>
#include <string>

namespace xefb {

// Minimal async HTTPS GET for the plugin side (SimBrief OFP fetch, the
// Navigraph API). The request runs on a worker thread; completion callbacks
// are delivered on the main thread when poll() is called (from the flight
// loop), so callers can safely touch XPLM / Ultralight from them.
//
// Windows: WinHTTP. macOS/Linux: TODO (libcurl or platform equivalent) —
// see the stub in HttpClient.cpp.
class HttpClient {
public:
    struct Response {
        long status = 0;          // HTTP status, 0 = transport failure
        std::string body;
        std::string error;        // non-empty on failure
        bool ok() const { return status >= 200 && status < 300; }
    };
    using Callback = std::function<void(const Response&)>;

    // headers: raw "Name: Value\r\n" block, or "".
    static void get(const std::string& url, const std::string& headers, Callback cb);
    static void post(const std::string& url, const std::string& headers,
                     const std::string& body, Callback cb);

    // Call once per frame from the main thread. Fires pending callbacks.
    static void poll();

    // Call on plugin shutdown; joins outstanding worker threads.
    static void shutdown();
};

} // namespace xefb
