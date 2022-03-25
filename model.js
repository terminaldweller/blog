"use strict";

const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const db = {};
db.mongoose = mongoose;
db.url = "mongo:27017";

const blogPostModel = mongoose.model(
  "blogPost",
  mongoose.Schema(
    {
      title: String,
      description: String,
      published: Boolean,
    },
    { timestamps: true }
  )
);

function dbInit() {
  db.mongoose
    .connect(db.url, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
      console.log("successfully connected to db");
    })
    .catch((err) => {
      console.log("cannot connect to the database: ", err);
      process.exit(1);
    });
}
module.exports = dbInit;
