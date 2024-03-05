# After NTP Comes NTS

Well for this one I will be talking a bit about NTP and NTS.<br/>
Unlike the DNS post there isnt much going on here.<br/>

NTP is plain-text, NTS uses TLS so if our requests are tampered with, we can know.<br/>
There is the "oooh, you cant see what I'm sending now" but in this case its NTP so the content being secret is not necessarily more important than making sure the content has not been modified(guarantee of integrity).<br/>

So far so good.<br/>
But before we go any further, lets talk about what we are trying to achieve here, in other works, what requirements are we trying to satisfy here:<br/>

- REQ-001: The NTP(NTS) requests shall be anonymous
- REQ-002: It shall be evient when an NTP(NTS) requests has been tampered with
- REQ-003: It should not be known which time servers are being used upstream by the client

Now talk about the problem. The protocol is fine. We are sending TCP with TLS here. That's brilliant. We get all this:<br/>

```
* Identity: Through the use of a X.509 public key infrastructure, implementations can cryptographically establish the identity of the parties they are communicating with.
* Authentication: Implementations can cryptographically verify that any time synchronization packets are authentic, i.e., that they were produced by an identified party and have not been modified in transit.
* Confidentiality: Although basic time synchronization data is considered nonconfidential and sent in the clear, NTS includes support for encrypting NTP extension fields.
* Replay prevention: Client implementations can detect when a received time synchronization packet is a replay of a previous packet.
* Request-response consistency: Client implementations can verify that a time synchronization packet received from a server was sent in response to a particular request from the client.
* Unlinkability: For mobile clients, NTS will not leak any information additional to NTP which would permit a passive adversary to determine that two packets sent over different networks came from the same client.
* Non-amplification: Implementations (especially server implementations) can avoid acting as distributed denial-of-service (DDoS) amplifiers by never responding to a request with a packet larger than the request packet.
* Scalability: Server implementations can serve large numbers of clients without having to retain any client-specific state.
* Performance: NTS must not significantly degrade the quality of the time transfer. The encryption and authentication used when actually transferring time should be lightweight.
```

exerpt from [RFC 8915](https://www.rfc-editor.org/rfc/rfc8915)

If we find a client that lets us use a SOCKS5 proxy, then we can send our NTS requests over Tor and then call it a day.<br/>
REQ-002 and REQ-003 are being satisfied by using TLS. The missing piece is REQ-001, anonymizing the requests.<br/>

This is not something for the protocol to handle so then we have to look for a client that support a SOCKS5 proxy.<br/>

Unfortunately [chrony](https://gitlab.com/chrony/chrony) and [ntpd-rs](https://github.com/pendulum-project/ntpd-rs) do not support SOCKS5 proxies.<br/>

- for ntpd-rs look [here](https://github.com/pendulum-project/ntpd-rs/discussions/1365)

Which menas our setup is not complete.<br/>

## Implementation

We will be using ntpd-rs as the client.<br/>
We will also setup one NTS server using [ntpsec](https://gitlab.com/NTPsec/ntpsec).<br/>

```toml
[observability]
log-level = "info"
observation-path = "/var/run/ntpd-rs/observe"

[[source]]
mode = "nts"
address = "virginia.time.system76.com"

[[source]]
mode = "nts"
address = "mmo1.nts.netnod.se"

[[source]]
mode = "nts"
address = "ntppool1.time.nl"

[[source]]
mode = "nts"
address = "ntp1.glypnod.com"

[[source]]
mode = "nts"
address = "ntp3.fau.de"

[synchronization]
single-step-panic-threshold = 1800
startup-step-panic-threshold = { forward="inf", backward = 1800 }
minimum-agreeing-sources = 3
accumulated-step-panic-threshold = 1800

[[server]]
listen = "127.0.0.1:123"

[[server]]
listen = "172.17.0.1:123"

[[server]]
listen = "192.168.121.1:123"

[[server]]
listen = "10.167.131.1:123"

[[server]]
listen = "[::1]:123"
```

```config
nts enable
nts key /etc/letsencrypt/live/nts.dehein.org/privkey.pem
nts cert /etc/letsencrypt/live/nts.dehein.org/fullchain.pem mintls TLS1.3
nts cookie /var/lib/ntp/nts-keys
nts-listen-on 4460
server 0.0.0.0 prefer

server ntpmon.dcs1.biz nts	# Singapore
server ntp1.glypnod.com nts	# San Francisco
server ntp2.glypnod.com nts	# London

tos maxclock 5

restrict default kod limited nomodify noquery
restrict -6 default kod limited nomodify noquery

driftfile /var/lib/ntp/ntp.drift

statsdir /var/log/ntpstats/
```

```yaml
version: "3.9"
services:
  filebrowser:
    image: ntpsec
    build:
      context: .
    deploy:
      resources:
        limits:
          memory: 128M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
    networks:
      - ntsnet
    ports:
      - "4460:4460/tcp"
    restart: unless-stopped
    entrypoint: ["ntpd"]
    command: ["-n", "-I", "0.0.0.0", "-d", "5"]
    volumes:
      - ./ntp.conf:/etc/ntp.conf:ro
      - /etc/letsencrypt/live/nts.dehein.org/fullchain.pem:/etc/letsencrypt/live/nts.dehein.org/fullchain.pem:ro
      - /etc/letsencrypt/live/nts.dehein.org/privkey.pem:/etc/letsencrypt/live/nts.dehein.org/privkey.pem:ro
      - vault:/var/lib/ntp
    cap_drop:
      - ALL
    cap_add:
      - SYS_NICE
      - SYS_RESOURCE
      - SYS_TIME
networks:
  ntsnet:
volumes:
  vault:
```

## Links

- [RFC 8915](https://www.rfc-editor.org/rfc/rfc8915)
- [Here](https://github.com/jauderho/nts-servers) you can find a list of publicly available servers that support NTS

<p>
  <div class="timestamp">timestamp:1709418680</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/NTP.md</div>
</p>
<br>
