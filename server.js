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
const helmet = require("helmet");
const morgan = require("morgan");
const model = require("./model");

model.dbInit();

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "css")));
app.use(express.static(path.join(__dirname, "static")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.set("view engine", "pug");

app.use(helmet());

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(self),midi=(self),sync-xhr=(self),microphone=(self),camera=(self),magnetometer=(self),gyroscope=(self),fullscreen=(self),payment=(self),usb=(self)",
  );
  next();
});

app.use(morgan("combined"));

async function enumerateDir() {
  return await fs.readdirSync(path.join(__dirname, "mds"));
}

function renderAndSend_v2(req, res, slug) {
  console.log(slug);
  model.blogPost
    .findOne(
      { slug: slug },
      {
        projection: {
          _id: 0,
          title: 0,
          teaser: 0,
        },
      },
    )
    .then(function (blogPost) {
      return res.render("index.ejs", {
        cache: true,
        data: {
          blogHttp: mit.render(blogPost.body),
          lastUpdatedAt: blogPost.lastUpdatedAt,
          keywords: blogPost.keywords,
        },
      });
    })
    .catch(function (err) {
      console.log(err);
      return err;
    });
}

function renderTagPage(req, res, tag) {
  model.blogPost
    .find(
      { keywords: { $in: [tag] } },
      { projection: { _id: 0, title: 0, teaser: 0, body: 0, keywords: 0 } },
    )
    .then(function (blogPosts) {
      return res.render("tags.ejs", {
        cache: true,
        data: {
          blogPosts: blogPosts,
        },
      });
    })
    .catch(function (err) {
      console.log(err);
      return err;
    });
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
  model.blogPost
    .find({}, { _id: 0, body: 0, teaser: 0, keywords: 0, lastUpdatedAt: 0 })
    .then(function (blogPosts) {
      res.render("archive.ejs", {
        cache: true,
        data: {
          blogPosts: blogPosts,
        },
      });
    })
    .catch(function (err) {
      console.log(err);
      return err;
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
  res.type("application/rss+xml");
  model.blogPost
    .find({})
    .sort("-lastUpdatedAt")
    .select("title slug lastUpdatedAt teaser")
    .then(function (posts) {
      return res.render("rss_feed_v2.pug", { cache: true, posts: posts });
    })
    .catch(function (err) {
      console.log(err);
      return err;
    });
});

app.get("/posts/:postName", (req, res) => {
  if (req.params["postName"] == "") {
    res.write("nothing requested!");
  }
  renderAndSend_v2(req, res, req.params.postName);
});

app.get("/tags/:tagName", (req, res) => {
  if (req.params["tagName"] == "") {
    res.write("nothing requested!");
  }
  renderTagPage(req, res, req.params.tagName);
});

app.get("/$", (req, res) => {
  model.blogPost
    .find({}, { projection: { _id: 0, title: 0, teaser: 0 } })
    .limit(1)
    .sort({ $natural: -1 })
    .then(function (blogPost) {
      return res.render("index.ejs", {
        cache: true,
        data: {
          blogHttp: mit.render(blogPost[0].body),
          lastUpdatedAt: blogPost[0].lastUpdatedAt,
          keywords: blogPost[0].keywords,
        },
      });
    })
    .catch(function (err) {
      console.log(err);
      return err;
    });
});

app.use(sitemap(enumerateDir, "https://blog.terminaldweller.com"));

app.use((req, res) => {
  return res.status(404).send({ message: "Path" + req.url + "not found!" });
});

app.use((err, req, res) => {
  return res.status(500).send({ error: err });
});

app.listen(9000, () => console.log("Server is running on port 9000"));
