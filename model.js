"use strict";

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
mongoose.Promise = global.Promise;
const db = {};
db.mongoose = mongoose;
const db_pass = fs.readFileSync("/run/secrets/mongo_pass").toString();
const db_user = fs.readFileSync("/run/secrets/mongo_user").toString();
db.url = "mongodb://" + db_user + ":" + db_pass + "@mongo:27017";

const BlogPostSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  body: { type: String, required: true },
  teaser: { type: String, required: true },
  keywords: { type: Array, required: true },
  lastUpdatedAt: { type: Number },
});

// a simple hook to update the timestamp(lastUpdatedAt) on update
BlogPostSchema.pre("save", function (next) {
  this.lastUpdatedAt = Date.now();
  next();
});

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

function populateDB(model) {
  let filePaths = fs.readdirSync(path.join(__dirname, "mds"));
  filePaths.forEach((fileName) => {
    let fileContent = fs
      .readFileSync(path.join(__dirname, "mds", fileName), "utf-8")
      .toString();
    let newBlogPost = new model({
      title: fileName,
      slug: fileName,
      body: fileContent,
      teaser: fileName,
      keywords: ["kw1", "kw2"],
    });
    newBlogPost.save();
  });
}

module.exports = {
  blogPost: mongoose.model("BlogPost", BlogPostSchema),
  dbInit: dbInit,
  populateDB: populateDB,
};
