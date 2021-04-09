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
app.use(express.static("./"));
app.use(express.static(path.join(__dirname, "css")));
app.set("views", "./views");
app.set("view engine", "ejs");
app.engine("ejs", require("ejs").__express);

app.get("/", (req, res) => {
  let readStream = fs.createReadStream("./mds/cstruct2luatable.md", "utf-8");
  // FIXME-this is gonna be so wrong when the md is bigger than one chunk
  readStream.on("data", (chunk) => {
    res.render("index", {
      data: {
        blogHttp: mit.render(chunk),
        mds: ["c struct to lua table", "lazy makefiles", "telegram lua"],
      },
    });
    console.log(mit.render(chunk));
  });
});

app.listen(3000);
