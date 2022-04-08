#!/usr/bin/env node
"use strict";

const express = require("express");
const sitemap = require("express-sitemap-xml");
const path = require("path");
const fs = require("fs");
const mit = require("markdown-it")({ html: true })
  .enable(["table"])
  .disable(["strikethrough"])
  .use(require("markdown-it-texmath"), {
    engine: require("katex"),
    delimiters: "gitlab",
    katexOptions: { macros: { "\\RR": "\\mathbb{R}" } },
  })
  .use(require("markdown-it-multimd-table"))
  .use(require("markdown-it-highlightjs"), {
    inline: true,
    auto: true,
    code: true,
  });
const spdy = require("spdy");
const helmet = require("helmet");
const morgan = require("morgan");
const pug = require("pug");

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "css")));
app.use(express.static(path.join(__dirname, "static")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);

app.use(helmet.crossOriginEmbedderPolicy());
app.use(helmet.crossOriginOpenerPolicy());
app.use(helmet.crossOriginResourcePolicy());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.expectCt());
app.use(helmet.frameguard());
app.use(helmet.hidePoweredBy());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.originAgentCluster());
app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(self),midi=(self),sync-xhr=(self),microphone=(self),camera=(self),magnetometer=(self),gyroscope=(self),fullscreen=(self),payment=(self),usb=(self)"
  );
  next();
});
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      baseUri: ["self"],
      defaultSrc: ["self"],
      scriptSrc: ["none"],
      styleSrc: ["self", "https:", "unsafef-inline"],
    },
  })
);

app.use(morgan("combined"));

async function enumerateDir() {
  return await fs.readdirSync(path.join(__dirname, "mds"));
}

function renderAndSend(req, res) {
  try {
    let viewPath;
    if (req.path == "/") {
      viewPath = "mds/cstruct2luatable.md";
    } else {
      viewPath = req.path;
    }
    let readStream = fs.createReadStream(
      path.join(__dirname, viewPath),
      "utf-8"
    );
    //FIXME-this can obviously fail
    readStream.on("data", (chunk) => {
      res.render("index", {
        cache: true,
        data: {
          blogHttp: mit.render(chunk),
          mds: fs.readdirSync(path.join(__dirname, "mds"), "utf-8"),
        },
      });
    });
  } catch (err) {
    console.log(err);
  }
}

app.get("/health", (req, res) => {
  res.type("application/json");
  let response = { isOK: "True", error: "" };
  res.send(response);
});

app.get("/about", (req, res) => {
  res.type("text/html");
  res.sendFile(path.join(__dirname, "static/about.html"));
});

app.get("/archive", (req, res) => {
  res.type("text/html");
  res.render("archive", {
    cache: true,
    data: {
      mds: fs.readdirSync(path.join(__dirname, "mds"), "utf-8"),
    },
  });
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  let robots_txt = "Sitemap: http://blog.terminaldweller.com\n";
  robots_txt += "User-agent: *\n";
  robots_txt += "Disallow: \n";
  robots_txt += "Crawl-Delay: 20";
  res.send(robots_txt);
});

app.get("/rss/feed", (req, res) => {
  const compiledFunction = pug.compileFile("./views/rss_feed.pug");
  const files = fs.readdirSync(path.join(__dirname, "mds"));
  for (const file of files) {
    res.send(compiledFunction(file));
  }
});

app.get("/$", (req, res) => {
  renderAndSend(req, res);
});

app.get("/mds/:mdname$", (req, res) => {
  if (req.params["mdname"] == "") {
    res.write("nothing requested!");
  }
  renderAndSend(req, res);
});

app.use(sitemap(enumerateDir, "https://blog.terminaldweller.com"));

app.use((req, res) => {
  return res.status(404).send({ message: "Path" + req.url + "not found!" });
});

app.use((err, req, res) => {
  return res.status(500).send({ error: err });
});

if (process.env.SERVER_DEPLOYMENT_TYPE == "deployment") {
  spdy
    .createServer(
      {
        key: fs.readFileSync("/certs/privkey1.pem", "utf-8"),
        cert: fs.readFileSync("/certs/fullchain1.pem", "utf-8"),
      },
      app
    )
    .listen(process.env.SERVER_LISTEN_PORT || 9000);
} else if (process.env.SERVER_DEPLOYMENT_TYPE == "test") {
  spdy
    .createServer(
      {
        key: fs.readFileSync("/certs/server.key", "utf-8"),
        cert: fs.readFileSync("/certs/server.cert", "utf-8"),
      },
      app
    )
    .listen(process.env.SERVER_LISTEN_PORT || 9000);
}
