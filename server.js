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
const https = require("https");

const app = express();
app.use(express.static(path.join(__dirname, "css")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);

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

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  let robots_txt = "Sitemap: http://blog.terminaldweller.com\n";
  robots_txt += "User-agent: *\n";
  robots_txt += "Disallow: \n";
  robots_txt += "Crawl-Delay: 20";
  res.send(robots_txt);
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

async function enumerateDir() {
  return await fs.readdirSync(path.join(__dirname, "mds"));
}

app.use(sitemap(enumerateDir, "http://blog.terminaldweller.com"));

app.use((req, res) => {
  return res.status(404).send({ message: "Path" + req.url + "not found!" });
});

app.use((err, req, res) => {
  return res.status(500).send({ error: err });
});

https.createServer({
  key: fs.readFileSync('/certs/server.key'),
  cert: fs.readFileSync("/certs/server.cert")
},app).listen(9000);

// app.listen(9000);
