"use strict";

const fs = require("fs");
const path = require("path");

var blogs = [
  {
    title: "Turning C structs into Lua tables",
    slug: "c_struct_lua_table",
    body: fs.readFileSync(path.join(__dirname) + "/mds/cstruct2luatable.md"),
    teaser: fs.readFileSync(path.join(__dirname) + "/mds/cstruct2luatable.txt"),
    keywords: ["c", "lua"],
    lastUpdatedAt: Date.now(),
  },
  {
    title: "Lazy Makefiles",
    slug: "lazy_makefile",
    body: fs.readFileSync(path.join(__dirname) + "/mds/lazymakefiles.md"),
    teaser: fs.readFileSync(path.join(__dirname) + "/mds/lazymakefiles.txt"),
    keywords: ["makefile", "c", "c++"],
    lastUpdatedAt: Date.now(),
  },
  {
    title: "One Chat Client For Everything",
    slug: "one_chat_client_for_everything",
    body: fs.readFileSync(
      path.join(__dirname) + "/mds/oneclientforeverything.md",
    ),
    teaser: fs.readFileSync(
      path.join(__dirname) + "/mds/oneclientforeverything.txt",
    ),
    keywords: [
      "irc",
      "matrix",
      "mattermost",
      "matterbridge",
      "bitlbee",
      "irssi",
    ],
    lastUpdatedAt: Date.now(),
  },
  {
    title: "How to Get your SMS on IRC",
    slug: "how_to_get_your_sms_on_irc",
    body: fs.readFileSync(
      path.join(__dirname) + "/mds/howtogetyourSMSonIRC.md",
    ),
    teaser: fs.readFileSync(
      path.join(__dirname) + "/mds/howtogetyourSMSonIRC.txt",
    ),
    keywords: ["irc", "bot", "sms"],
    lastUpdatedAt: Date.now(),
  },
  {
    title:
      "What to do with your DNS when ODoH's Trust-Me-Bruh Model doesn't work for you",
    slug: "what_to_do_with_your_dns",
    body: fs.readFileSync(path.join(__dirname) + "/mds/DNS.md"),
    teaser: fs.readFileSync(path.join(__dirname) + "/mds/DNS.txt"),
    keywords: ["DNS", "DoH", "DoT", "ODoH", "Tor", "dnscrypt-proxy", "vagrant"],
    lastUpdatedAt: Date.now(),
  },
  {
    title: "After NTP comes NTS",
    slug: "after_ntp_comes_nts",
    body: fs.readFileSync(path.join(__dirname) + "/mds/NTP.md"),
    teaser: fs.readFileSync(path.join(__dirname) + "/mds/NTP.txt"),
    keywords: ["NTP", "NTS", "SOCKS5"],
    lastUpdatedAt: Date.now(),
  },
  {
    title: "Docker, Linux, Security. Kinda.",
    slug: "docker_linux_security",
    body: fs.readFileSync(path.join(__dirname) + "/mds/securedocker.md"),
    teaser: fs.readFileSync(path.join(__dirname) + "/mds/securedocker.txt"),
    keywords: ["docker", "linux", "security"],
    lastUpdatedAt: Date.now(),
  },
];

db.blogposts.insertMany(blogs);
// db.blogposts.updateMany(
//   { $set: blogs },
//   {
//     upsert: true,
//   },
// );
