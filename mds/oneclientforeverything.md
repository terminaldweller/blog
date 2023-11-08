# One Client for Everything


# Table of Contents
1. [Foreword](#foreword)
2. [Two ways of solving this](#two-ways-of-solving-this)
3. [The web app way](#the-web-app-way)
4. [gui or terminal client](#gui-or-terminal-client)
5. [Matrix or IRC](#matrix-or-irc)
 
## Foreword
 

First let's talk about the problem we're trying to solve here. I want to have a unified interface into all the communication forms that I use.<br/>
I can't be bothered to have different clients open all the time. I want to have one client that takes care of all things mostly well.<br/>

## Two ways of solving this

There is generally two ways one can try to solve this. number one is to just use a browser. Almost all forms of comm nowadays have a web client so basically one way of solving our problem is to a dedicated browser that has all the clients open. Mind you, there are even specialized and more lightweight browser offerings specifically geared towards this use-case but still this option is not ideal in terms of resources and the interface you're getting is not really unified.<br/>

### The web app way

An example that comes to mind for this sort of solution is `rambox` though they are no longer offering a FOSS solution. I'm just mentioning them as an example of what's being offered out there as a ready-to-use solution.<br/>

Although this way of doing things is very resource-intensive, this is the **complete** way of doing things. What I mean by that is that by using the official web apps, you will not be compromising on any features that the clients offer since you will be using the official clients.<br/>

### gui or terminal client

The second way of going about and solving this is to pick a very good client that supports a protocol with a lot of bridges and then bridge everything through to the app of that one protocol.<br/>
Currently there are only three protocols that have enough facilities for bridging to make this feasible. IRC, Matrix and XMPP.<br/>
I'm adding XMPP for the sake of completion but in terms of practicality XMPP doesn't have nearly as many bridges as IRC and Matrix.<br/>

So this basically narrows down our choice to either IRC or Matrix.<br/>
Now lets look at the clients that are available for these two protocols.<br/>

### Matrix or IRC

The last requirement on my side is that i would rather use a unified terminal keyboard-based client than a web application client. That being said, i definitely expect to use a web client since using a terminal client on a smart phone is pretty much just pain. A lot of pain.<br/>

Unfortunately at the time of writing this post, Matrix has no terminal client that comes close to either [irssi](https://github.com/irssi/irssi) or [weechat](https://github.com/weechat/weechat), both terminal clients originally only supporting IRC but later advertising themselves as multi-chat clients.<br/>
Also as an added bonus, starting from the next irssi release which should be irssi v1.5 one can elect not to build the IRC module at all while building irssi.<br/>

Matrix and IRC both have a rich ecosystem of bridges. Matrix has a growing fan base which means more and more bridges or tools with similar functionality will be releases for it. Contrast that with IRC where that number seems to be smaller than Matrix but still is very much alive and well.<br/>

## [bitlbee-libpurple](https://github.com/bitlbee/bitlbee)
 
```
it'll be bitlbee
```

bitlbee is a bridge software for IRC. The distinguishing feature for bitlbee is that the way it bridges other protocols to IRC is by masquerading as an ircd.<br/>
You could also use libpurple as the backend for bitlbee ([link](https://wiki.bitlbee.org/HowtoPurple)).<br/>
libpurple has an origin story similar to libreadline. Basically it used to live inside pidgin, but later on it was turned into a library so that other applications could use it as well.<br/>


List of protocols supported by libpurple:<br/>
```
aim
bitlbee-discord
bitlbee-mastodon
bonjour
eionrobb-icyque
eionrobb-mattermost
eionrobb-rocketchat
facebook
gg
hangouts
hehoe-signald
hehoe-whatsmeow
icq
irc
jabber
matrix
meanwhile
novell
otr
simple
sipe
skypeweb
slack
steam
telegram-tdlib
zephyr
```
 
## [matterbridge](https://github.com/42wim/matterbridge)
matterbridge is an everything-to-everything bridge.<br/>

Please keep in mind that with matterbridge, you don't get the full functionality of a protocol as in you get no private messages and such. You get the ability to join public chat rooms or whatever they call it in that protocol.<br/>
 
## bridge ircds

### [matterircd](https://github.com/42wim/matterircd)
a mattermost bridge that emulates an ircd as the name implies.

### [matrix2051](https://github.com/progval/matrix2051)
another bridge that emulates an ircd, but for matrix.

### [irslackd](https://github.com/adsr/irslackd)
a bridge to slack that emulates an ircd.


### docker compose
[Here](https://github.com/ezkrg/docker-bitlbee-libpurple)'s the original Dockerfile. You can find mine [here](https://github.com/terminaldweller/docker-bitlbee-libpurple).<br/>
And here's the docker compose file I use that goes with that:<br/>

```yaml
version: "3.8"
services:
  bitlbee:
    image: devi_bitlbee
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    networks:
      - bitlbeenet
    ports:
      - "127.0.0.1:8667:6667"
      - "172.17.0.1:8667:6667"
    restart: unless-stopped
    user: "bitlbee:bitlbee"
    command: ["/usr/sbin/bitlbee", "-F","-n","-u","bitlbee","-c","/var/lib/bitlbee/bitlbee.conf", "-d","/var/lib/bitlbee"]
    dns:
      - 9.9.9.9
    volumes:
      - ./conf/bitlbee.conf:/var/lib/bitlbee/bitlbee.conf:ro
      - userdata:/var/lib/bitlbee
      - /home/devi/.cache/docker-bitlbee/signald/run:/var/run/signald
      - /etc/ssl/certs:/etc/ssl/certs:ro
  signald:
    image: signald/signald:stable
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    networks:
      - signalnet
    ports:
      - "127.0.0.1:7775:7775"
      - "172.17.0.1:7775:7775"
    restart: unless-stopped
    dns:
      - 9.9.9.9
    volumes:
      - /home/devi/.cache/docker-bitlbee/signald/run:/signald
      - /etc/ssl/certs:/etc/ssl/certs:ro
    environment:
      - SIGNALD_ENABLE_METRICS=false
      - SIGNALD_HTTP_LOGGING=true
      - SIGNALD_VERBOSE_LOGGING=true
      - SIGNALD_METRICS_PORT=7775
      - SIGNALD_LOG_DB_TRANSACTIONS=true
  matterircd:
    image: 42wim/matterircd:latest
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    networks:
      - matterircdnet
    ports:
      - "127.0.0.1:7667:7667"
      - "172.17.0.1:7667:7667"
    dns:
      - 9.9.9.9
    restart: unless-stopped
    command: ["--conf", "/matterircd.toml"]
    volumes:
      - ./matterircd.toml:/matterircd.toml:ro
networks:
  bitlbeenet:
  signalnet:
  matterircdnet:
volumes:
  userdata:
  matterircddb:
```

<p>
  <div class="timestamp">timestamp:1699398469</div>
  <div class="version">version:0.1.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
</p>
<br>
