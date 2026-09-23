#pragma once
#include <functional>
#include <string>
#include <vector>

namespace xefb {

// Navigraph OAuth2 (device authorization / RFC 8628) + the bits xEFB needs
// from it: the linked SimBrief user id and the charts API.
//
// SCAFFOLD — interface only, no .cpp in the build yet. The endpoints and flow
// are in docs/navigraph-integration.md. Implement against the live API once a
// client_id (XEFB_NAVIGRAPH_CLIENT_ID) is supplied; build on HttpClient. With
// no client_id, enabled() must return false and everything no-ops.
class NavigraphClient {
public:
    struct Account {
        bool        linked = false;
        std::string displayName;
        std::string simbriefUserId;
        std::string airacCycle;
    };
    struct Chart {
        std::string id;
        std::string name;
        std::string category;      // APP / SID / STAR / TAXI / REF
        std::string runway;
        bool        georeferenced = false;
    };

    static bool enabled();          // a client_id was compiled in

    // Device flow. onCode fires with the short code + URL to show the pilot;
    // onDone fires once with the resulting Account (linked=false on failure).
    using CodeCb = std::function<void(const std::string& userCode, const std::string& url)>;
    using AccountCb = std::function<void(const Account&)>;
    static void signIn(CodeCb onCode, AccountCb onDone);
    static void signOut();

    // Restore tokens from disk and silently refresh; onDone with linked state.
    static void restore(AccountCb onDone);
    static const Account& account();

    // Charts API (requires a linked account).
    using ChartsCb = std::function<void(const std::string& icao, const std::vector<Chart>&)>;
    using ImageCb  = std::function<void(const std::string& chartId, const std::string& dataUrl)>;
    static void charts(const std::string& icao, ChartsCb cb);
    static void chartImage(const std::string& chartId, bool night, ImageCb cb);

    // Fetch the signed-in user's latest SimBrief OFP (raw JSON). Falls back to
    // an explicit id when not linked.
    using OfpCb = std::function<void(const std::string& rawJson, const std::string& error)>;
    static void fetchOfp(const std::string& explicitUserId, OfpCb cb);
};

} // namespace xefb
