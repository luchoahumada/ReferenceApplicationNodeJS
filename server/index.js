const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const catalogueDir = path.join(srcDir, "catalogue");
const toolsDir = path.join(rootDir, "tools");
const logDir = path.join(rootDir, "log");
const profilesPath = path.join(srcDir, "profiles.json");
const multiperiodConfigPath = path.join(toolsDir, "test", "multiperiod_00llama_h264.json");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
const persistSessions = new Map();

const adsPool = [
  "https://refapp.hbbtv.org/videos/test/test4_5s.mp4",
  "https://refapp.hbbtv.org/videos/test/test1_15s.mp4",
  "https://refapp.hbbtv.org/videos/test/test2_15s.mp4",
  "https://refapp.hbbtv.org/videos/test/test3_15s.mp4",
  "https://refapp.hbbtv.org/videos/test/test4_15s.mp4",
  "https://refapp.hbbtv.org/videos/test/test1_30s.mp4",
];

function noCacheHeaders(res) {
  res.setHeader("Expires", "Mon, 20 Dec 1998 01:00:00 GMT");
  res.setHeader("Last-Modified", new Date().toUTCString());
  res.setHeader("Cache-Control", "no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

function corsHeaders(res, origin = "*") {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST");
  res.setHeader("Access-Control-Max-Age", "1");
}

function legacyDrmCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "origin,range,accept,accept-encoding,referer,content-type,SOAPAction,X-AxDRM-Message,access-control-allow-origin"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "server,range,content-range,content-length,content-type,date"
  );
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Content-Length", "0");
    res.setHeader("Expires", "-1");
    res.status(204).end();
    return true;
  }
  return false;
}

function getApplicationProfile(userAgent = "") {
  const matches = userAgent.match(/HbbTV\/\d\.(\d)\.\d/);
  if (!matches) {
    return { ...profiles.EME, userAgent };
  }

  const version = Number(matches[1]);
  let profile = profiles.unknown;
  if (version === 2) {
    profile = profiles["HbbTV1.5"];
  } else if (version >= 3) {
    profile = profiles["HbbTV2.0"];
  } else if (version === 1) {
    profile = profiles["HbbTV1.0"];
  }
  return { ...profile, userAgent };
}

function fileVersion(relativeToCatalogue) {
  const absolute = path.join(catalogueDir, relativeToCatalogue);
  if (!fs.existsSync(absolute)) return relativeToCatalogue;
  return `${relativeToCatalogue}?version=${fs.statSync(absolute).mtimeMs}`;
}

function resourceTags(profileResources, query, isHttps) {
  const resources = [
    "menu.css",
    "../videoplayer/vplayer.css",
    "../common.css",
    "../debugscreen.css",
    "../jquery-1.11.3.min.js",
    "../common.js",
    "../common2.js",
    "../dialog.js",
    "../dialog.css",
    "application.js",
    "gridcolumn.js",
    "gridview.js",
    "gridscrollview.js",
    "gridviewbox.js",
    "menu.js",
    "topmenu.js",
    "topmenuitem.js",
    "../debugscreen.js",
    "../log.js",
    "../keycodes.js",
    "navigation.js",
    "../videoplayer/videoplayer_basic.js",
    "../videoplayer/monitor/monitor-base.js",
  ];

  if (profileResources === "mse-eme") {
    const dashjs = query.dashjs || "";
    if (dashjs === "nightly") {
      resources.push(
        `${isHttps ? "https:" : "http:"}//reference.dashif.org/dash.js/nightly/dist/legacy/umd/dash.all.debug.js`
      );
    } else if (dashjs === "v4") {
      resources.push("../videoplayer/dash.all.min_v4.7.4.js");
    } else if (dashjs === "latest") {
      resources.push(`${isHttps ? "https:" : "http:"}//cdn.dashjs.org/latest/dash.all.min.js`);
    } else if (dashjs === "debug") {
      resources.push("../videoplayer/dash.all.debug.js");
    } else {
      resources.push("../videoplayer/dash.all.min.js");
    }
    resources.push("../videoplayer/videoplayer_mse-eme.js");
  } else if (profileResources === "html5") {
    resources.push("../videoplayer/videoplayer_html5.js");
  } else if (profileResources === "oipf") {
    resources.push("../videoplayer/videoplayer_oipf.js");
  }

  const useOptimized = Object.prototype.hasOwnProperty.call(query, "optimize");
  const appMinJs = path.join(catalogueDir, "app.min.js");
  const appMinCss = path.join(catalogueDir, "app.min.css");
  const useMinJs = useOptimized && fs.existsSync(appMinJs);
  const useMinCss = useOptimized && fs.existsSync(appMinCss);
  let output = "";

  if (useMinJs) {
    output += `<script src='app.min.js?version=${fs.statSync(appMinJs).mtimeMs}' type='text/javascript'></script>\n`;
  }
  if (useMinCss) {
    output += `<link href='app.min.css?version=${fs.statSync(appMinCss).mtimeMs}' rel='stylesheet' type='text/css'/>\n`;
  }

  if (!useMinJs || !useMinCss) {
    resources.forEach((file) => {
      const versioned = file.startsWith("http") ? file : fileVersion(file);
      if (!useMinJs && file.endsWith("js")) {
        output += `<script src='${versioned}' type='application/javascript'></script>\n`;
      } else if (!useMinCss && file.endsWith("css")) {
        output += `<link href='${versioned}' rel='stylesheet' type='text/css'/>\n`;
      }
    });
  }

  return output;
}

function pageShell({ profile, profileResources, preInitScript }) {
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>HbbTV Reference Video Application</title>
  <meta http-equiv="content-type" content="${profile.contentType}; charset=UTF-8" />
  ${preInitScript}
  <script onload="odd.init('sofia')" src="https://odd.dtv.fi/odd.js"></script>
</head>
<body onload="onLoad();">
  <div style="visibility:hidden;width:0px;height:0px;">
    <object id="appmgr" type="application/oipfApplicationManager"></object>
    <object id="oipfcfg" type="application/oipfConfiguration"></object>
  </div>
  <div id="videodiv"></div>
  <div id="wrapper">
    <div id="logo1"></div>
    <div id="menu"></div>
    <div id="logo2"></div>
    <div id="itemDescription"></div>
  </div>
  <div id="info" class="hide"></div>
  <div id="infoBox" class="hide"></div>
</body>
</html>`;
}

function getRemoteIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

function parseKidGuidFromPlayready(xml) {
  if (!xml) return { kid: "", algId: "" };
  const wrmIdx = xml.indexOf("<WRMHEADER");
  let delimS = xml.indexOf("<KID>", wrmIdx);
  let delimE = -1;
  let algId = "";

  if (delimS < 1) {
    delimS = xml.indexOf("<KID ", wrmIdx);
    delimS = delimS > 0 ? xml.indexOf('VALUE="', delimS) + 7 : -1;
    delimE = delimS > 7 ? xml.indexOf('"', delimS) : -1;
    algId = xml.indexOf(' ALGID="AESCBC"', wrmIdx) > 0 ? "aescbc" : "";
  } else {
    delimE = xml.indexOf("</KID>", delimS);
    if (delimE > 0) delimS += 5;
    algId = xml.indexOf("<ALGID>AESCBC</", wrmIdx) > 0 ? "aescbc" : "";
  }
  if (delimE < 0) return { kid: "", algId };

  const raw = xml.substring(delimS, delimE);
  const hex = Buffer.from(raw, "base64").toString("hex");
  if (hex.length < 32) return { kid: "", algId };

  const guid =
    `${hex.substring(6, 8)}${hex.substring(4, 6)}${hex.substring(2, 4)}${hex.substring(0, 2)}` +
    `-${hex.substring(10, 12)}${hex.substring(8, 10)}` +
    `-${hex.substring(14, 16)}${hex.substring(12, 14)}` +
    `-${hex.substring(16, 20)}` +
    `-${hex.substring(20, 32)}`;

  return { kid: guid, algId };
}

function mapPlayreadyUrl(alias) {
  const map = {
    MS1331:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQTMQ==,$algId)",
    MS1332:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQTMg==,$algId)",
    MS1333:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQTMw==,$algId)",
    MS1334:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQTNA==,$algId)",
    MS1234:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSNA==,$algId)",
    MS1235:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSNQ==,$algId)",
    MS1236:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSNg==,$algId)",
    MS1237:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSNw==,$algId)",
    MS1238:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSOA==,$algId)",
    MS1239:
      "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSOQ==,$algId)",
    clientinfo: "https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(msg:clientinfo)",
  };
  if (!alias || alias === "MS1236h") {
    return "http://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:header,sl:2000,persist:false,contentkey:EjQSNBI0EjQSNBI0EjQSNg==,$algId)";
  }
  return map[alias] || alias;
}

function addPlayreadyPersist(url, seconds = 15 * 60) {
  const now = new Date();
  const begin = new Date(now.getTime() - 240000);
  const end = new Date(now.getTime() + (seconds + 240) * 1000);
  const fmt = (d) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(
      d.getUTCHours()
    ).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}`;
  return url.replace(",persist:false,", `,persist:true,begindate:${fmt(begin)},enddate:${fmt(end)},`);
}

async function proxyBinary(req, res, targetUrl, body, headers) {
  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  res.status(response.status);
  res.setHeader("content-type", response.headers.get("content-type") || "application/octet-stream");
  res.send(bytes);
}

app.use("/editor", express.static(path.join(toolsDir, "editor")));
app.use(express.static(srcDir));
app.use("/tools", express.static(toolsDir));
app.use(express.json({ limit: "5mb" }));
app.use(express.text({ type: ["text/*", "application/xml", "application/soap+xml"], limit: "20mb" }));

app.get("/", (req, res) => {
  res.redirect("/catalogue/index");
});

app.get("/catalogue/index", (req, res) => {
  const profile = getApplicationProfile(req.headers["user-agent"]);
  if (!profile.supported) {
    res.redirect("/catalogue/unsupported.html");
    return;
  }

  noCacheHeaders(res);
  res.setHeader("Content-Type", `${profile.contentType};charset=utf-8`);
  const isHttps = req.protocol === "https";
  const profileResources = profile.version;
  const preInitScript = `<script type="application/javascript">
var profile = { hbbtv : ${JSON.stringify(profile.hbbtv)}, video : ${JSON.stringify(profile.video)}, version : ${JSON.stringify(profile.version)}};
console.log("Application Start");
var config = null, loading = false, animating = false, menu = null, vplayer = null, main = null, lastError = null;
function onLoad() {
  registerKeys(1); registerKeyListener(); showApplication();
  try { init(); } catch(e) { lastError = e; error(e); }
}
</script>`;
  const docType = profile.doctype;
  const xmlHeader = profile.xmlHeader ? `${profile.xmlHeader}\n` : "";
  const html = pageShell({
    profile,
    profileResources,
    preInitScript: `${preInitScript}\n${resourceTags(profileResources, req.query, isHttps)}`,
  });
  res.send(`${xmlHeader}${docType}\n${html.substring(html.indexOf("<html"))}`);
});

app.get("/catalogue/index-html5", (req, res) => {
  noCacheHeaders(res);
  res.setHeader("Content-Type", "application/vnd.hbbtv.xhtml+xml;charset=utf-8");
  const script = `<script type="application/javascript">
var profile = { hbbtv : "2.0", video : "html5", version : "html5"};
console.log("Application Start");
var config = null, loading = false, animating = false, menu = null, vplayer = null, main = null, lastError = null;
function onLoad(){ showApplication(); try{ init(); } catch(e){ lastError = e; error(e); } registerKeys(1); registerKeyListener(); }
</script>`;
  const html = pageShell({
    profile: { contentType: "application/vnd.hbbtv.xhtml+xml" },
    profileResources: "html5",
    preInitScript: `${script}\n${resourceTags("html5", req.query, req.protocol === "https")}`,
  });
  res.send(`<?xml version='1.0' encoding='utf-8' ?>\n<!DOCTYPE html>\n${html.substring(html.indexOf("<html"))}`);
});

app.get("/catalogue/index-oipf", (req, res) => {
  noCacheHeaders(res);
  res.setHeader("Content-Type", "application/vnd.hbbtv.xhtml+xml;charset=utf-8");
  const script = `<script type="application/javascript">
var profile = { hbbtv : "1.5", video : "avobject", version : "oipf"};
console.log("Application Start");
var config = null, loading = false, animating = false, menu = null, vplayer = null, main = null;
function onLoad(){ registerKeys(1); registerKeyListener(); showApplication(); init(); }
</script>`;
  const html = pageShell({
    profile: { contentType: "application/vnd.hbbtv.xhtml+xml" },
    profileResources: "oipf",
    preInitScript: `${script}\n${resourceTags("oipf", req.query, req.protocol === "https")}`,
  });
  res.send(
    `<?xml version='1.0' encoding='utf-8' ?>\n<!DOCTYPE html PUBLIC '-//HbbTV//1.2.1//EN' 'http://www.hbbtv.org/dtd/HbbTV-1.2.1.dtd'>\n${html.substring(
      html.indexOf("<html")
    )}`
  );
});

app.get("/catalogue/index-mse-eme", (req, res) => {
  noCacheHeaders(res);
  res.setHeader("Content-Type", "text/html;charset=utf-8");
  const script = `<script type="application/javascript">
var profile = { hbbtv : false, video : "dashjs", version : "mse-eme"};
console.log("Application Start");
var config = null, loading = false, animating = false, menu = null, vplayer = null, main = null;
function onLoad(){ showApplication(); init(); registerKeys(1); registerKeyListener(); }
</script>`;
  const html = pageShell({
    profile: { contentType: "text/html" },
    profileResources: "mse-eme",
    preInitScript: `${script}\n${resourceTags("mse-eme", req.query, req.protocol === "https")}`,
  });
  res.send(`<!DOCTYPE html>\n${html.substring(html.indexOf("<html"))}`);
});

app.get("/catalogue/index.php", (req, res) => res.redirect("/catalogue/index"));
app.get("/catalogue/index_html5.php", (req, res) => res.redirect("/catalogue/index-html5"));
app.get("/catalogue/index_oipf.php", (req, res) => res.redirect("/catalogue/index-oipf"));
app.get("/catalogue/index_mse-eme.php", (req, res) => res.redirect("/catalogue/index-mse-eme"));

app.options("/api/subs", (req, res) => {
  corsHeaders(res, req.headers.origin || req.headers.host || "*");
  res.status(204).end();
});
app.get("/api/subs", async (req, res) => {
  noCacheHeaders(res);
  corsHeaders(res, req.headers.origin || req.headers.host || "*");
  res.setHeader("Content-Type", "application/ttml+xml;charset=UTF-8");
  const fileUrl = req.query.file;
  if (!fileUrl) return res.status(400).send("missing file parameter");
  try {
    const proxy = await fetch(fileUrl);
    const body = await proxy.text();
    res.status(proxy.status).send(body);
  } catch (err) {
    res.status(502).send(String(err.message || err));
  }
});

app.get("/api/ads", (req, res) => {
  const adBreaks = Number(req.query.breaks || 1);
  const preroll = String(req.query.position || "") === "preroll";
  const pool = [...adsPool];
  if (!preroll) {
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  res.type("application/json").send(JSON.stringify(pool.slice(0, adBreaks), null, 2));
});

app.post("/api/log", express.json({ limit: "5mb" }), (req, res) => {
  const type = String(req.query.type || "log");
  const data = Array.isArray(req.body) ? req.body : null;
  if (!data) {
    res.type("application/json").send("{'message' : 'Error saving client side message to server'}");
    return;
  }
  const file = path.join(logDir, `${type}.txt`);
  const ua = req.headers["user-agent"] || "";
  data.forEach((entry) => {
    const row = {
      time: new Date().toISOString().replace("T", " ").substring(0, 19),
      user_agent: ua,
      message: entry,
    };
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  });
  res.type("application/json").send(`{'message' : '${data.length} client side ${type} saved to server'}`);
});

app.post("/api/catalogue/log/save", express.json({ limit: "100mb" }), (req, res) => {
  try {
    const files = fs.readdirSync(logDir).filter((name) => /^log\d+\.json$/.test(name));
    const max = files.reduce((acc, name) => Math.max(acc, Number(name.match(/^log(\d+)\.json$/)[1])), -1);
    const filename = `log${max + 1}.json`;
    fs.writeFileSync(path.join(logDir, filename), JSON.stringify(req.body, null, 2));
    res.json({ success: true, log: `log/${filename}` });
  } catch (err) {
    res.json({ success: false, message: String(err.message || err) });
  }
});

app.post("/api/editor/config", express.text({ type: "*/*", limit: "250kb" }), (req, res) => {
  const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (payload.length > 200 * 1024) {
    return res.status(400).json({ status: "ERROR", message: "Data too large" });
  }
  if (payload.length < 20) {
    return res.status(400).json({ status: "ERROR", message: "Data is empty" });
  }
  try {
    JSON.parse(payload);
  } catch (err) {
    return res.status(400).json({ status: "ERROR", message: "Invalid JSON" });
  }
  fs.writeFileSync(path.join(catalogueDir, "config.json"), payload);
  return res.json({ status: "OK" });
});

app.all("/api/test/laurl-pr", express.text({ type: "*/*", limit: "30mb" }), async (req, res) => {
  noCacheHeaders(res);
  legacyDrmCorsHeaders(res);
  if (handleOptions(req, res)) return;
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  const query = typeof req.body === "string" ? req.body : "";
  const { kid, algId } = parseKidGuidFromPlayready(query);
  const alias = req.query.laurl || (kid ? `MS${kid.substring(32, 36)}` : "");
  let targetUrl = mapPlayreadyUrl(alias);
  targetUrl = algId === "aescbc" ? targetUrl.replace("$algId", "ckt:aescbc") : targetUrl.replace(",$algId", "");
  if (req.query.persist) {
    targetUrl = addPlayreadyPersist(targetUrl, 15 * 60);
  }
  const headers = {
    "Content-Type": "text/xml; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(query)),
  };
  const soapAction = req.headers.soapaction;
  if (soapAction) headers.SOAPAction = soapAction;
  ["header-customdata", "header-nvauth", "header-nvpreauth", "header-dtcd", "header-axdrmmessage"].forEach((key) => {
    const v = req.query[key];
    if (v) headers[key] = String(v);
  });
  try {
    const response = await fetch(targetUrl, { method: "POST", headers, body: query });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).send(String(err.message || err));
  }
});

app.all("/api/test/laurl-pr-persist", express.text({ type: "*/*", limit: "30mb" }), async (req, res) => {
  noCacheHeaders(res);
  legacyDrmCorsHeaders(res);
  if (handleOptions(req, res)) return;
  if (req.query.persist === "status") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const key = `refapp-${getRemoteIp(req)}-${req.query.sessionid || ""}`;
    const current = persistSessions.get(key) || null;
    if (!current) return res.json({ status: null });
    const now = Date.now();
    return res.json({
      status: {
        ...current,
        lastAccessed: new Date(current.lastAccessedms).toISOString(),
        lastAccessedSince: now - current.lastAccessedms,
      },
    });
  }

  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  const sessionId = String(req.query.sessionid || "");
  if (req.query.persist && sessionId) {
    const key = `refapp-${getRemoteIp(req)}-${sessionId}`;
    const prev = persistSessions.get(key) || { requestCount: 0, sessionId };
    persistSessions.set(key, {
      ...prev,
      requestCount: prev.requestCount + 1,
      lastAccessedms: Date.now(),
    });
  }

  const query = typeof req.body === "string" ? req.body : "";
  const { kid, algId } = parseKidGuidFromPlayready(query);
  const alias = req.query.laurl || (kid ? `MS${kid.substring(32, 36)}` : "");
  let targetUrl = mapPlayreadyUrl(alias);
  targetUrl = algId === "aescbc" ? targetUrl.replace("$algId", "ckt:aescbc") : targetUrl.replace(",$algId", "");
  if (req.query.persist) {
    targetUrl = addPlayreadyPersist(targetUrl, Number(req.query.valid || 15 * 60));
  }
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(query)),
      },
      body: query,
    });
    res.status(response.status).send(await response.text());
  } catch (err) {
    res.status(502).send(String(err.message || err));
  }
});

app.all("/api/test/laurl-ck", express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  noCacheHeaders(res);
  legacyDrmCorsHeaders(res);
  if (handleOptions(req, res)) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  let kidHex = "";
  if (req.method === "POST") {
    try {
      const json = JSON.parse(Buffer.from(req.body || []).toString("utf8"));
      const first = (json.kids || [])[0] || "";
      kidHex = Buffer.from(first.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
    } catch (_err) {
      kidHex = "";
    }
  } else {
    const explicitKid = String(req.query.kid || "");
    if (explicitKid) {
      kidHex = explicitKid;
    } else {
      const raw = (req._parsedUrl.query || "").toString();
      kidHex = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex");
    }
  }
  kidHex = kidHex.toUpperCase();
  if (kidHex.length === 4) kidHex = `4321567812341234123412341234${kidHex}`;

  const keys = {
    "43215678123412341234123412341234": "12341234123412341234123412341234",
    "43215678123412341234123412341235": "12341234123412341234123412341235",
    "43215678123412341234123412341236": "12341234123412341234123412341236",
    "43215678123412341234123412341237": "12341234123412341234123412341237",
    "43215678123412341234123412341238": "12341234123412341234123412341238",
    "43215678123412341234123412341239": "12341234123412341234123412341239",
    "5A461E692ABF5534A30FFC45BFD7148D": "307F7B3F5579BEF53894A6D946762267",
  };

  const keyHex = keys[kidHex];
  if (!keyHex) return res.status(404).json({ message: "Unknown KID" });
  const k = Buffer.from(keyHex, "hex").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const kid = Buffer.from(kidHex, "hex").toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return res.json({ keys: [{ k, kty: "oct", kid }], type: "temporary" });
});

app.post("/api/test/laurl-wv", express.raw({ type: "*/*", limit: "20mb" }), async (req, res) => {
  noCacheHeaders(res);
  legacyDrmCorsHeaders(res);
  if (handleOptions(req, res)) return;
  res.setHeader("Content-Type", "application/octet-stream");

  const payload = Buffer.from(req.body || []);
  let laurl = String(req.query.laurl || "");
  const alg = String(req.query.alg || "cenc").toLowerCase();
  if (payload.length > 15 && !laurl) {
    let found = 13;
    for (let i = 10; i < payload.length - 5; i += 1) {
      if (
        (payload[i] === 0x08 && payload[i + 1] === 0x01 && payload[i + 2] === 0x12 && payload[i + 3] === 0x10) ||
        (payload[i] === 0x0a && payload[i + 1] === 0x30 && payload[i + 2] === 0x12 && payload[i + 3] === 0x10)
      ) {
        found = i;
      }
      if (payload[i] === 0x43 && payload[i + 1] === 0x21 && payload[i + 2] === 0x56 && payload[i + 3] === 0x78) {
        found = i - 4;
        break;
      }
    }
    const kid = payload.subarray(found + 4, found + 20).toString("hex");
    if (kid) {
      laurl = `Prod${kid.substring(28, 32)}`;
      if (alg === "cbcs") laurl = `${laurl}_CBCS`;
    }
  }
  if (payload.length > 0 && payload.length < 6 && !laurl) {
    laurl = "Prod1236";
  }

  const map = {
    wvproxy: "https://widevine-proxy.appspot.com/proxy",
    debug: "https://m.dtv.fi:8443/debug.jsp",
    Prod1234:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KcgAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIBvWQ0UTVvbmnBsYWPW04moKNTnqGI0a-p7HVtbTDyYPdvX3Mzel0xFeXzossdq2MhMAj0nREOeq3AC3ee6Li2TtK7BA_kDe5o-6Dzg7ORYKXnmh-PvhTRS0a5-2hZ7K4tD69GJJXJn3w1ZVxcnR7JG3RstdkanYkI0LSiNKyU39uYlQQUA1MUjnxSdiu8taJgaoHtC",
    Prod1235:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KdcAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIAkNQZ5zucxMDUEvO6uhp5QiUW9gN3SMS8dLT8T0GFLm88KRUIiM6sQOOqqNx9gL-FejCDaM721kqxIPWbxMAoXi3IHjFoPAIczz-0CtENO2OievwiCN-RFzcBxdOeRQWx2j3taqZ1y2ZPLqqbmMxpmF0Qw926Xl2w9vhmEaRITU33Lq1kK7uhIAf5z8V4DgEkRkJOy",
    Prod1236:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KeEAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIC7eetKNLrt0kWI-1g6u46WqQO13UEUkHevGFyrWZgfOYoPqWTl_d7A3qn7T1XpfADcozqapYVkHYwVekuq56wND7Sl35MlUFe4ecVKIHU5vjzoczEpth9-q-bIc1vrWZNfoQbBKBxy3Q1jXib_CbukzBiQv3HxYmFezmal6JCiawF3LH4Ptqg6iG38rTNCaAnAuLKM",
    Prod1237:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KZ4AJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAICuhJDhUbGN_mJLOCREdhhtGjYnKhjRDLhIoXN4wSy3OsITEwP0_ttZHRGKmGAdh3MsT9ZsZi7EUPeyrFfspFKcgmjpmvB4WTvI629HmG7PCyN-SiVZGRqUkQm_Db4BFwg_Qxz8Cc3B6AqsBau-CXWEz6AJOESBIJVuqttuFNxesxDJslzNrRX0EMb0GJtWtWcmFoEp",
    Prod1235_CBCS:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KdcAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIAkNQZ5zucxMDUEvO6uhp5QiUW9gN3SMS8dLT8T0GFLm88KRUIiM6sQOOqqNx9gL-FejCDaM721kqxIPWbxMAoXi3IHjFoPAIczz-0CtENO2OievwiCN-RFzcBxdOeRQWx2j3taqZ1y2ZPLqqbmMxpmF0Qw926Xl2w9vhmEaRITU33Lq1kK7uhIAf5z8V4DgEkRkJOy",
    Prod1236_CBCS:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KfcAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIDO1fImL3H2sAcEsPbaJ7lvHKsudYA2crFN_RqG9_eMl5Veynbrosm-HsP_Cv_2Gvt8veUp2rt-2iGK45Kqx-1riTiiCn9fhfNRKDyGFk9qq_KCkyh8hpXXQMaMIKFRlXuBNvcHWu8NDIy0W8shSYGVNfNPZ6HhMIYmEMb0P9CrBnnyJ9Jwth-GoDCiNyqRIaLO96rr",
    Prod1237_CBCS:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KbQAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAAIAcywxhKuUjclu8Mb9U7vyiHX7LosyvpXYWSh6PcuQSH-_9KXdk4KQApHHaYBVrSJS0D2Q-AlVJlfwtA5qWCvnBRjJMA2OKJLdZXa9gYXdkulPNia4DV0tc_M9q12tA4LehD3n6ZcmdD7hXScxGPFWF_H9RH7kZFIl9BNPLsHeBp6yiyWCLq47pvRUZrNsluwDk6eu2",
    Prod12371236:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2Ka4AJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAALAFdou2SIbyKqi5RDgerm-ZsPiDAdAue82-S8Q147it6Me9-jXfOvA75VksodkyBnY27Qwr-k8C1HmTKohRD08aLt99RTs1BFlugeXtPkQhElyNUAHK2JbDwyI1XRc2bO32APE_dgDXgvXGu732Cio8yssnE3aXlwCLH-TGv_vb4QCDGd_g4EE0WG7subaW3THF5N3O38UEpNldofSiqLb4_5OA31PMkrwvGf6cEuPIR3kq3gtN4-9sTtZhZMOl3qomwUum",
    Prod12371236_7:
      "https://wv.service.expressplay.com/hms/wv/rights/?ExpressPlayToken=BwAAABc2KaYAJDY2NzY5OWMwLTViODYtNDMwOS1iMjA4LTRlY2JkMjdmMWNmOAAAALDljjYzDweX6ApBcKBnxCeSNWvnElm336havWqZQA6F6TYuTsSxVjHTotRJhSdpn_5_v7mnYEXmWr6bkjsazYl-S2PvabSjgPPpQi_gql6BAv0gxqyhzsf1wPv0b5RUY81dc_jH6TcAV0QXc3GUpBp6eSvAxPazPakR8RKiMuwYwxKN1oZYdWwibdwarXuQr466WuDo0Z1dKU8hwwtZEbGb_HC_lPXTZ5KtxxMGgeMG0MUV3RRsdo8H-WVzlqAQ1Rza5UGK",
  };
  const targetUrl = map[laurl] || laurl;
  if (!targetUrl) return res.status(400).send("Missing laurl");
  try {
    await proxyBinary(req, res, targetUrl, payload, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(payload.length),
    });
  } catch (err) {
    res.status(502).send(Buffer.from(String(err.message || err), "utf8"));
  }
});

app.get("/api/test/multiperiod", async (req, res) => {
  noCacheHeaders(res);
  legacyDrmCorsHeaders(res);
  if (handleOptions(req, res)) return;
  // Keep parity by using the public multiperiod reference generator.
  const base = "https://refapp.hbbtv.org/videos/multiperiod_v8.php";
  const qs = new URLSearchParams(req.query).toString();
  const target = `${base}${qs ? `?${qs}` : ""}`;
  try {
    const response = await fetch(target);
    const text = await response.text();
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/dash+xml");
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).type("text/plain").send(String(err.message || err));
  }
});

app.get("/api/test/multiperiod-config", (req, res) => {
  if (!fs.existsSync(multiperiodConfigPath)) {
    return res.status(404).json({ message: "Config not found" });
  }
  return res.sendFile(multiperiodConfigPath);
});

const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`ReferenceApplication Node server listening on http://${host}:${port}`);
});
