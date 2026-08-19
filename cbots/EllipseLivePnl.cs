// ─────────────────────────────────────────────────────────────────────────────
// EllipseLivePnl — read-only cTrader cBot that streams live account state to the
// Ellipse trading dashboard. It NEVER places, modifies, or closes an order — it
// only reads balance / equity / floating P&L / open positions and POSTs them to
// your /api/ctrader/ingest endpoint. Safe for funded/prop accounts.
//
// MULTI-ACCOUNT: run ONE instance per account. In cTrader add each account, open
// a chart on it, add this cBot, set "Account Label" to the SAME name that account
// has in the dashboard (accounts[].name / the challenge's linked account), and
// Start. Each instance reports only the account its chart belongs to.
//
// SETUP:
//   1. cTrader → Automate → New cBot → paste this → Build.
//   2. When adding the bot to a chart, allow Access Rights = Full Access
//      (required so it can make the outbound HTTPS POST).
//   3. Set parameters: Ingest URL, API Key, Account Label, Post Interval.
//
// Parameters map to the dashboard/server:
//   Ingest URL  = https://<your-app>/api/ctrader/ingest
//   API Key     = the value of CTRADER_INGEST_KEY in your Vercel env
//   Account Label = must match the dashboard account name (e.g. "tradinghive")
// ─────────────────────────────────────────────────────────────────────────────
using System;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text;
using cAlgo.API;

namespace cAlgo.Robots
{
    [Robot(AccessRights = AccessRights.FullAccess, AddIndicators = false)]
    public class EllipseLivePnl : Robot
    {
        [Parameter("Ingest URL", DefaultValue = "https://your-app.vercel.app/api/ctrader/ingest")]
        public string IngestUrl { get; set; }

        [Parameter("API Key", DefaultValue = "")]
        public string ApiKey { get; set; }

        [Parameter("Account Label", DefaultValue = "")]
        public string AccountLabel { get; set; }

        [Parameter("Post Interval (seconds)", DefaultValue = 5, MinValue = 1)]
        public int PostSeconds { get; set; }

        [Parameter("Only post on change", DefaultValue = false)]
        public bool OnlyOnChange { get; set; }

        private static readonly HttpClient _client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        private string _lastPayload = null;

        protected override void OnStart()
        {
            if (string.IsNullOrWhiteSpace(ApiKey))
                Print("WARNING: API Key is empty — the ingest endpoint will reject posts (401).");
            if (string.IsNullOrWhiteSpace(AccountLabel))
                Print("WARNING: Account Label is empty — set it to the account's name in the dashboard.");

            Print("EllipseLivePnl started for account {0} ({1}). Posting every {2}s to {3}",
                Account.Number, Label(), PostSeconds, IngestUrl);

            // First snapshot immediately, then on a timer.
            PostSnapshot();
            Timer.Start(TimeSpan.FromSeconds(PostSeconds));
        }

        protected override void OnTimer()
        {
            PostSnapshot();
        }

        protected override void OnStop()
        {
            Timer.Stop();
        }

        private string Label()
        {
            return string.IsNullOrWhiteSpace(AccountLabel) ? Account.Number.ToString() : AccountLabel.Trim();
        }

        private void PostSnapshot()
        {
            try
            {
                var json = BuildJson();
                if (OnlyOnChange && json == _lastPayload) return;

                using (var content = new StringContent(json, Encoding.UTF8, "application/json"))
                {
                    // Fully qualify: cAlgo.API also defines an HttpMethod type.
                    var req = new HttpRequestMessage(System.Net.Http.HttpMethod.Post, IngestUrl) { Content = content };
                    if (!string.IsNullOrWhiteSpace(ApiKey))
                        req.Headers.Add("Authorization", "Bearer " + ApiKey.Trim());

                    // Synchronous send on a short timeout — the payload is tiny and the
                    // interval is seconds, so the brief block is harmless.
                    var res = _client.SendAsync(req).GetAwaiter().GetResult();
                    if (!res.IsSuccessStatusCode)
                    {
                        var body = res.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                        Print("Ingest POST failed {0}: {1}", (int)res.StatusCode, Trim(body, 200));
                    }
                    else
                    {
                        _lastPayload = json;
                    }
                }
            }
            catch (Exception ex)
            {
                Print("Ingest POST error: {0}", ex.Message);
            }
        }

        private string BuildJson()
        {
            var ci = CultureInfo.InvariantCulture;
            var sb = new StringBuilder(1024);
            sb.Append('{');
            sb.Append("\"accountLabel\":").Append(Str(Label())).Append(',');
            sb.Append("\"accountNumber\":").Append(Account.Number.ToString(ci)).Append(',');
            sb.Append("\"currency\":").Append(Str(Account.Asset != null ? Account.Asset.Name : "")).Append(',');
            sb.Append("\"balance\":").Append(Num(Account.Balance)).Append(',');
            sb.Append("\"equity\":").Append(Num(Account.Equity)).Append(',');
            // UnrealizedNetProfit is the account-level floating (net of commission/swap).
            sb.Append("\"floatingPnl\":").Append(Num(Account.UnrealizedNetProfit)).Append(',');
            sb.Append("\"marginUsed\":").Append(Num(Account.Margin)).Append(',');
            // Broker server time (this dashboard treats the trading day in server time).
            sb.Append("\"serverTime\":").Append(Str(Server.Time.ToString("yyyy-MM-ddTHH:mm:ss", ci))).Append(',');
            sb.Append("\"utcTime\":").Append(Str(Server.TimeInUtc.ToString("yyyy-MM-ddTHH:mm:ssZ", ci))).Append(',');

            sb.Append("\"positions\":[");
            var first = true;
            foreach (var p in Positions)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('{');
                sb.Append("\"positionId\":").Append(p.Id.ToString(ci)).Append(',');
                sb.Append("\"symbol\":").Append(Str(p.SymbolName)).Append(',');
                sb.Append("\"side\":").Append(Str(p.TradeType == TradeType.Buy ? "Buy" : "Sell")).Append(',');
                sb.Append("\"lots\":").Append(Num(p.Quantity)).Append(',');
                sb.Append("\"volume\":").Append(Num(p.VolumeInUnits)).Append(',');
                sb.Append("\"entry\":").Append(Num(p.EntryPrice)).Append(',');
                sb.Append("\"floatPnl\":").Append(Num(p.NetProfit)).Append(',');
                sb.Append("\"swap\":").Append(Num(p.Swap)).Append(',');
                sb.Append("\"commission\":").Append(Num(p.Commissions));
                sb.Append('}');
            }
            sb.Append(']');
            sb.Append('}');
            return sb.ToString();
        }

        private static string Num(double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) return "0";
            return d.ToString("0.########", CultureInfo.InvariantCulture);
        }

        private static string Str(string s)
        {
            if (s == null) return "\"\"";
            var sb = new StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        private static string Trim(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Length <= max ? s : s.Substring(0, max) + "…";
        }
    }
}
