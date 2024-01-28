# How to get your SMS on IRC

It's not really a continuation of the "one client for everything" post but it is in the same vein. Basically, in this post we are going to make it so that we receive our SMS messages on IRC. More specifically, it will send it to a IRC channel.<br/>
In my case this works and is actually secure, since the channel I have the SMS going to is on my own IRC network which only allows users in after they do a successful SASL authentication.<br/>

The general idea is this:

- We run an app on our phone that will send the SMS to a web hook server
- The web hook server has an IRC client that will send the message to the IRC channel

### security considerations

#### SMS vs [RCS](https://en.wikipedia.org/wiki/Rich_Communication_Services)

For forwarding the SMS I get on my cellphone from my cellphone to the web hook server, i use [android_income_sms_gateway_webhook](https://github.com/bogkonstantin/android_income_sms_gateway_webhook). This app does not support RCS(see [#46](https://github.com/bogkonstantin/android_income_sms_gateway_webhook/issues/46)).<br/>
For this to work, make sure your phone has RCS disabled unless you use another app that supports RCS.<br/>

#### web hook server connection

The app will be connecting to our web hook server. The ideal way I wanted to do this would be to connect to a VPN, only through which we can access the web hook server. But its android not linux. I dont know how I can do that on android so that's a no go.<br/>
Next idea is to use local port mapping using openssh to send the SMS through the ssh tunnel. While that is very feasible without rooting the phone, a one-liner in termux can take care of it but automating it is a bit of a hassle.<br/>
Currently the only measure I am taking is to just use https instead of http.<br/>
Since we are using only tls we can use the normal TLS hardening measures, server-side. We are using nginx as the reverse proxy. We will also terminate the tls connection on nginx.<br/>
We will be using [pocketbase](https://github.com/pocketbase/pocketbase) for the record storage and authentication. We can extend pocketbase which is exactly how we will be making our sms web hook.<br/>
Pocketbase will give us the record storage and authentication/registration we need. We will use [girc](https://github.com/lrstanley/girc) for our IRC library. My personal IRC network wll require successful SASL authentication before letting anyone into the network so supporting SASL auth(PLAIN) is a requirement.

We can use basic http authentication using our chosen app. We can configure the JSON body of the POST request our web hook server will receive.<br/>
The default POST request the app will send looks like this:<br/>
For the body:

```json
{
  "from": "%from%",
  "text": "%text%",
  "sentStamp": "%sentStamp%",
  "receivedStamp": "%receivedStamp%",
  "sim": "%sim%"
}
```

And for the header:

```json
{ "User-Agent": "SMS Forwarder App" }
```

We get static cerdentials so we can only do basic http auth. We dont need to encode the client information into the security token so we'll just rely on a bearer-token in the header for both authentication and authorization.<br/>

#### Authentication and Authorization

In our case, the only resource we have is to be able to post anything on the endpoint so in our case, authentication and authorization will be synonimous.<br/>
We can put the basic auth cerdentials in the url:

```
https://user:pass@sms.mywebhook.com
```

#### Deployment

```nginx
events {
  worker_connections 1024;
}
http {
  include /etc/nginx/mime.types;
  server_tokens off;
  limit_req_zone $binary_remote_addr zone=one:10m rate=30r/m;
  server {
    listen 443 ssl;
    keepalive_timeout 60;
    charset utf-8;
    ssl_certificate /etc/letsencrypt/live/sms.terminaldweller.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sms.terminaldweller.com/privkey.pem;
    ssl_ciphers HIGH:!aNULL:!MD5:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_prefer_server_ciphers on;
    tcp_nopush on;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer";
    fastcgi_hide_header X-Powered-By;

    error_page 401 403 404 /404.html;
    location / {
      proxy_pass http://sms-webhook:8090;
    }
  }
}
```

```yaml
version: "3.9"
services:
  sms-webhook:
    image: sms-webhook
    build:
      context: .
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    networks:
      - smsnet
    restart: unless-stopped
    depends_on:
      - redis
    volumes:
      - pb-vault:/sms-webhook/pb_data
      - ./config.toml:/opt/smswebhook/config.toml
    cap_drop:
      - ALL
    dns:
      - 9.9.9.9
    environment:
      - SERVER_DEPLOYMENT_TYPE=deployment
    entrypoint: ["/sms-webhook/sms-webhook"]
    command: ["serve", "--http=0.0.0.0:8090"]
  nginx:
    deploy:
      resources:
        limits:
          memory: 128M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    image: nginx:stable
    ports:
      - "8090:443"
    networks:
      - smsnet
    restart: unless-stopped
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - DAC_OVERRIDE
      - SETGID
      - SETUID
      - NET_BIND_SERVICE
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt/live/sms.terminaldweller.com/fullchain.pem:/etc/letsencrypt/live/sms.terminaldweller.com/fullchain.pem:ro
      - /etc/letsencrypt/live/sms.terminaldweller.com/privkey.pem:/etc/letsencrypt/live/sms.terminaldweller.com/privkey.pem:ro
networks:
  smsnet:
    driver: bridge
volumes:
  pb-vault:
```

<p>
  <div class="timestamp">timestamp:1706042815</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/lazymakefiles.md</div>
</p>
<br>
