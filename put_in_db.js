"use strict";
// mongosh --host 127.0.0.1 --port 27117 -u mongo -p mongo -f put_in_db.js

const fs = require("fs");
const path = require("path");
// db = connect("http://mongo:mongo@127.0.0.1:27117");

blogs = [
  {
    title: "Turning C structs into Lua tables",
    slug: "c_struct_lua_table",
    body: fs.readFileSync(path.join(__dirname) + "/mds/cstruct2luatable.md"),
    teaser: "Turning C structures into Lua tables",
    keywords: "c,lua",
    lastUpdatedAt: Date.now(),
  },
  {
    title: "Lazy Makefiles",
    slug: "lazy_makefile",
    body: fs.readFileSync(path.join(__dirname) + "/mds/lazymakefiles.md"),
    teaser: "Lazy Makefiles",
    keywords: "makefile,c,c++",
    lastUpdatedAt: Date.now(),
  },
  {
    title: "One Chat Client For Everything",
    slug: "one_chat_client_for_everything",
    body: fs.readFileSync(
      path.join(__dirname) + "/mds/oneclientforeverything.md"
    ),
    teaser: "One Chat Client For Everything",
    keywords: "irc,matrix,mattermost,matterbridge,bitlbee,irssi",
    lastUpdatedAt: Date.now(),
  },
];

// db.blogposts.insertMany([blog_entry_1, blog_entry_2, blog_entry_3]);
db.blogposts.updateMany(blogs, {
  upsert: true,
});
