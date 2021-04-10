#!/usr/bin/env node
"use strict";

const express = require("express");
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

const app = express();
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "css")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);

app.get("/", (req, res) => {
  let readStream = fs.createReadStream(
    path.join(__dirname, "mds/cstruct2luatable.md"),
    "utf-8"
  );
  // FIXME-this is gonna be so wrong when the md is bigger than one chunk
  readStream.on("data", (chunk) => {
    res.render("index", {
      data: {
        blogHttp: mit.render(chunk),
        mds: fs.readdirSync(path.join(__dirname, "mds"), "utf-8"),
      },
    });
  });
});

app.listen(3000);
