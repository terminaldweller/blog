[![Codacy Badge](https://app.codacy.com/project/badge/Grade/fd49b1a14156479492bf414fdde868bd)](https://www.codacy.com/gh/terminaldweller/web/dashboard?utm_source=github.com&utm_medium=referral&utm_content=terminaldweller/web&utm_campaign=Badge_Grade)

# Blog

It's the source code for my blog.<br/>
You find the live instance [here](https://blog.terminaldweller.com)<br/>
You also can use the RSS feed to get notified of when there are new posts.<br/>

## How it works

The blog post data is being kept in a mongodb instance so if we need anything we get it from there.</br>
The process of adding posts is manual.</br>
The blog has RSS functionality.</br>
You can list all posts that have the same tag.</br>
Our paths are static, we ask express to do the caching instead of something more explicit.</br>
