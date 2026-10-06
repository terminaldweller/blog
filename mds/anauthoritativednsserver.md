# An Authoritative DNS server

## Design

For this one, we will make our own authoritative DNS server. A hidden primary and then three public secondary instances that will actually serve the records. The primary will hold the actual zone file. When updates are available, the primary notifies the secondaries and then the secondaries can initiate an XFR(IXFR or AXFR). Note that the hidden primary does not need to be publicly reachable because the primary will be talking(XFR) to the secondaries over yggdrasil. The primary will make the initial peering and hence, does not need to be on the open internet. The hidden primary can actually stay hidden.

Like previously mentioned for the XFR transport, we will use [yggdrasil](https://github.com/yggdrasil-network/yggdrasil-go). That way we can get a secure transport for the XFRs. We will use one private yggdrasil network per secondary since using one private yggdrasil mesh network for the primary and secondaries would allow the secondaries to talk to each other while they have no reason to talk to each other. We will use public keys, passwords and group passwords for yggdrasil. We will further secure the XFRs with ACLs that bind to the yggdrasil address only, plus require mTLS.

I've chosen to use certs issued by my local CA here. For the local CA, I'm using [step-ca](https://github.com/smallstep/certificates). Setting up step-ca is out of scope for this post.

We will be serving on standard ports. Port 53 for UDP and TCP and port 853 for DoT(TCP) and DoQ(UDP).

For the actual authoritative DNS part we will be using knot. Since knot will not let us define more than one TLS key-pair per instance, and we are already using that for mTLS for XFR ACLs, we will use [dnsdist](https://github.com/PowerDNS/pdns) as the frontend for the secondaries that are public-facing. Dnsdist will hold the letsencrypt key-pair(we need the letsencrypt X.509 key pair for DoT and DoQ) and will terminate TLS for DoT and DoQ and forward the queries to knot. We also get the bonuses that come with using dnsdist such as rate-limiting and bans.

For the secondaries we will take a "zonefile-less" approach. All the info and updates will be kept in the journal.

We will let the primary knot instance handle the DNSSEC keys automatically.

We will also use one TSIG(transaction signature) key per secondary to further secure the XFRs.

In its current form, updates are written manually to the zonefile.

## Implementation

Before we start, a note regarding notation and it is notation, not environment variables.
YGG_SUBNET_1 to YGG_SUBNET_3 are the yggdrasil nodes' routed subnet address running on the hidden primary.
YGG_SUBNET_4 to YGG_SUBNET_6 run on the secondaries, one for each.
The matching is:
YGG_SUBNET_1 <---> YGG_SUBNET_4
YGG_SUBNET_2 <---> YGG_SUBNET_5
YGG_SUBNET_3 <---> YGG_SUBNET_6
So those are how our three private yggdrasil networks are made.

Here's the layout:
* for the hidden primary, we will have 3 yggdrasil instances and knot
* for the public secondaries, each instance will have dnsdist, yggdrasil and knot

### Hidden Primary

First the compose file:

```yaml
services:
  knot-primary:
    image: knot
    build:
      context: .
      dockerfile: ./Dockerfile_knot
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
    networks:
      xfr1net:
        ipv6_address: YGG_SUBNET_1::2
      xfr2net:
        ipv6_address: YGG_SUBNET_2::2
      xfr3net:
        ipv6_address: YGG_SUBNET_3::2
    restart: unless-stopped
    volumes:
      - knot-storage:/storage:rw
      - ./knot.conf:/config/knot.conf:ro
      - ./primary.lan.crt:/etc/knot/pki/primary.crt:ro
      - ./primary.lan.key:/etc/knot/pki/primary.key:ro
      - ./root_ca.crt:/etc/knot/pki/ca.crt:ro
      - ./knot-entrypoint.sh:/knot-entrypoint.sh:ro
      - ./zones:/var/lib/knot/zones:ro
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /rundir:rw,noexec,nosuid,size=64m
      - /tmp:rw,noexec,nosuid,size=64m,mode=1777
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
      - CAP_DAC_OVERRIDE
    entrypoint: ["/knot-entrypoint.sh"]
  yggdrasil-xfr1:
    image: yggdrasil
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
        max-file: "3"
    networks:
      xfr1net:
        ipv6_address: YGG_SUBNET_1::10
    restart: unless-stopped
    volumes:
      - ./yggdrasil-xfr1.conf:/etc/yggdrasil.conf:ro
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /var/run:rw,noexec,nosuid,size=16m
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    sysctls:
      net.ipv6.conf.all.forwarding: "1"
    command: ["-useconffile", "/etc/yggdrasil.conf"]
  yggdrasil-xfr2:
    image: yggdrasil
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
        max-file: "3"
    networks:
      xfr2net:
        ipv6_address: YGG_SUBNET_2::10
    restart: unless-stopped
    volumes:
      - ./yggdrasil-xfr2.conf:/etc/yggdrasil.conf:ro
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /var/run:rw,noexec,nosuid,size=16m
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    sysctls:
      net.ipv6.conf.all.forwarding: "1"
    command: ["-useconffile", "/etc/yggdrasil.conf"]
  yggdrasil-xfr3:
    image: yggdrasil
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
        max-file: "3"
    networks:
      xfr3net:
        ipv6_address: YGG_SUBNET_3::10
    restart: unless-stopped
    volumes:
      - ./yggdrasil-xfr3.conf:/etc/yggdrasil.conf:ro
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /var/run:rw,noexec,nosuid,size=16m
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    sysctls:
      net.ipv6.conf.all.forwarding: "1"
    command: ["-useconffile", "/etc/yggdrasil.conf"]
networks:
  xfr1net:
    enable_ipv6: true
    driver: bridge
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv6: nat-unprotected
    ipam:
      config:
        - subnet: YGG_SUBNET_1::/64
  xfr2net:
    enable_ipv6: true
    driver: bridge
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv6: nat-unprotected
    ipam:
      config:
        - subnet: YGG_SUBNET_2::/64
  xfr3net:
    enable_ipv6: true
    driver: bridge
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv6: nat-unprotected
    ipam:
      config:
        - subnet: YGG_SUBNET_3::/64
volumes:
  knot-storage:
```

Here's knot-entrypoint.sh:
```sh
#!/bin/sh
set -ex

ip -6 route replace "YGG_SUBNET_4::2/128" via "YGG_SUBNET_1::10"
ip -6 route replace "YGG_SUBNET_5::2/128" via "YGG_SUBNET_2::10"
ip -6 route replace "YGG_SUBNET_6::2/128" via "YGG_SUBNET_3::10"

exec knotd -c /config/knot.conf
```

The first thing you should notice is that we are using the yggdrasil routed addresses and not the node addresses. That is because knot will be doing the talking and we will route the knot traffic through yggdrasil so on the other end, the receiving knot instance will see the routed address and not the node address.
For the networks, the networks subnet address will be the yggdrasil routed address. For the knot network addresses, avoid using the ":1" address since docker uses that for the gateway of that network. If you do that docker will rightfully complain. We have to enable ipv6 for these three networks since yggdrasil the overlay mesh uses ipv6. The underlay can be ipv4 or ipv6 but the overlay is ipv6-only.
It might help to think of our networking situation like this: a routed yggdrasil address allows a node running yggdrasil to essentially become an yggdrasil router and route traffic over yggdrasil for other nodes that do not have access to yggdrasil. For that to happen, the other nodes will need an ipv6 address in the same subnet as the yggdrasil routed address plus a route to the node(that's what we are doing in the knot-entrypoint.sh).
Again, it is exactly because of that we will be using the yggdrasil routed addresses in the knot config for XFRs and not the yggdrasil node addresses.
That's also why we enable `net.ipv6.conf.all.forwarding: "1"` since our yggdrasil containers need to be able to forward ipv6 which is what a router should be able to do.

For the certs we use for PKI, keep in mind that the certs in question should have both `client-auth` and `server-auth` since the primary and secondaries will play both client and server role. When the primary notifies the secondaries the primary is the client and the secondaries are the servers. After the notify, the secondaries query the primary's SOA serial, if it's newer than what they are currently serving, then they initiate an XFR, in which case, they are now the client and the primary is the server.

To get the yggdrasil routed addresses you first need to create your yggdrasil conf using `yggdrasil -genconf > yggdrasil.conf` and then point yggdrasil at that conf file and ask it for the routed subnet address. You can run `yggdrasil -help` for more details. The command would look like this: `yggdrasil -useconffile yggdrasil.conf -subnet`.

Finally, a note regarding `nat-unprotected`. Without it, docker will not permit direct routed access to unpublished container ports. With it set, docker will allow routed access to unpublished ports, granted there is a route defined.

```txt
template:
  - id: default
    zonefile-sync: -1
    zonefile-load: difference-no-serial
    journal-content: all

server:
    listen-tls: YGG_SUBNET_1::2@853
    listen-tls: YGG_SUBNET_2::2@853
    listen-tls: YGG_SUBNET_3::2@853
    cert-file: /etc/knot/pki/primary.crt
    key-file:  /etc/knot/pki/primary.key
    ca-file:   /etc/knot/pki/ca.crt

key:
  - id: xfr-ns1.mydomain.org.
    algorithm: hmac-sha384
    secret: secret1
  - id: xfr-ns2.mydomain.org.
    algorithm: hmac-sha384
    secret: secret2
  - id: xfr-ns3.mydomain.org.
    algorithm: hmac-sha384
    secret: secret3

policy:
  - id: dnssec-p384
    algorithm: ECDSAP384SHA384
    zsk-lifetime: 90d
    ksk-lifetime: 0

remote:
  - id: ns1
    address: YGG_SUBNET_4::2@853
    via: YGG_SUBNET_1::2
    tls: on
    key: xfr-ns1.mydomain.org.
    cert-hostname: secondary1.lan
  - id: ns2
    address: YGG_SUBNET_5::2@853
    via: YGG_SUBNET_2::2
    tls: on
    key: xfr-ns2.mydomain.org.
    cert-hostname: secondary2.lan
  - id: ns3
    address: YGG_SUBNET_6::2@853
    via: YGG_SUBNET_3::2
    tls: on
    key: xfr-ns3.mydomain.org.
    cert-hostname: secondary3.lan

acl:
  - id: ns1-xfr
    address: YGG_SUBNET_4::2
    protocol: tls
    cert-hostname: secondary1.lan
    key: xfr-ns1.mydomain.org.
    action: transfer
  - id: ns2-xfr
    address: YGG_SUBNET_5::2
    protocol: tls
    cert-hostname: secondary2.lan
    key: xfr-ns2.mydomain.org.
    action: transfer
  - id: ns3-xfr
    address: YGG_SUBNET_6::2
    protocol: tls
    cert-hostname: secondary3.lan
    key: xfr-ns3.mydomain.org.
    action: transfer

zone:
  - domain: mydomain.com.
    storage: /var/lib/knot/zones
    file: mydomain.com.zone
    notify: [ns1, ns2, ns3]
    acl: [ns1-xfr, ns2-xfr, ns3-xfr]
    dnssec-signing: on
    dnssec-policy: dnssec-p384
    zonefile-sync: -1
  - domain: mydomain.org.
    storage: /var/lib/knot/zones
    file: mydomain.org.zone
    notify: [ns1, ns2, ns3]
    acl: [ns1-xfr, ns2-xfr, ns3-xfr]
    dnssec-signing: on
    dnssec-policy: dnssec-p384
    zonefile-sync: -1
```

The default template section is asking knot not to write changes back to the zonefile(for the primary that would include the DNSSEC records) which in turn makes it nicer to commit the zonefile to a version control. Without that, we would have to make changes to the zonefile, get them to knot for it to write the DNSSEC records to the zonefile and then them back to version control to have them updated and committed.
The other two options tell knot to handle the SOA serial automatically and to keep the zone contents along with its change history in the journal(kinda like git does).

Our primary will only listen on its three yggdrasil routed addresses for XFRs. We also define the primary’s certificate and private key, together with the CA certificate.

To generate the three TSIG secrets, run:
```
keymgr -t xfr-ns1.mydomain.org. hmac-sha384
keymgr -t xfr-ns2.mydomain.org. hmac-sha384
keymgr -t xfr-ns3.mydomain.org. hmac-sha384
```

The remotes section is where we define the secondaries. You can choose a DNS name in the certificate's SAN. The mTLS here just needs to match the SAN that we say it will have to what the secondaries' certs provide there are no extra requirements like a normal A/AAAA address resolution. Just identity checking so feel free to pick whatever SAN you want.

In the acl section we set ACLs for the XFRs. We are using the yggdrasil address, the TSIG key and mTLS here.

The final section is the zone section where we define the actual zones. Note that we are using `zonefile-sync: -1` here which is the same as what the default template was defining(yes, it is redundant since the default template is already saying that knot will not write to the zonefile).

One final note:
We set the ksk lifetime to zero. That means we will never have a roll-over for our ksk(key-signing-key). This of course, only covers automatic roll-overs. We can still choose to manually roll-over the ksk as well. If we had set that to a non-zero value, we would have to update our DS records and we would have to send the new DS records to our parent zone which could be done through your registrar's API(hopefully they have one).
We also set the zsk(zone-signing-key)'s lifetime to 90d or 90 days. For a zsk roll-over knot will handle the roll-over itself. We don't need to update the parent zone for that.

```txt
{
  PrivateKey: ygg-private-key
  Peers: [
  tls://NS1_IP_ADDRESS:PORT?key=key&password=password
  ]
  InterfacePeers: {}
  MulticastInterfaces: []
  Listen: []
  AllowedPublicKeys: []
  GroupPassword: "grouppassword"
  IfName: auto
  IfMTU: 65535
  NodeInfoPrivacy: true
  NodeInfo: {}
}
```

For our primary's ygg config, we will add a matching secondary's listener address to `Peers`. Remember that on the primary we will have three yggdrasil nodes, with three different config files. This is just one of them.
We want the primary to initiate peering on yggdrasil. This has two benefits. One, the hidden primary is in charge of making the connection and two, this will allow the hidden primary to be in a local network and not have it have to be on the internet.
Everything else is as we previously discussed. We are using a private yggdrasil network per primary-secondary pair, so all in all, three yggdrasil networks. We use the key and password as authentication for peering and then the grouppassword. Only nodes with the same grouppassword can talk to each other.

```dockerfile
FROM golang:1.26-alpine3.24 AS builder
RUN apk add git
WORKDIR /user
RUN git clone https://github.com/yggdrasil-network/yggdrasil-go &&\
  cd yggdrasil-go &&\
  git checkout v0.5.14 &&\
  ./build

FROM alpine:3.24
COPY --from=builder /user/yggdrasil-go/yggdrasil /usr/bin/yggdrasil
COPY --from=builder /user/yggdrasil-go/yggdrasilctl /usr/bin/yggdrasilctl
ENTRYPOINT ["/usr/bin/yggdrasil"]
```

```dockerfile
FROM cznic/knot:3.5

RUN apt-get update \
 && apt-get install -y --no-install-recommends iproute2 \
 && rm -rf /var/lib/apt/lists/*
```

The first dockerfile is for yggdrasil since, at the time of writing this yggdrasil does not have an official docker image or I couldn't find one.

The second one is for knot because we need the `ip` command to modify the routes in `knot-entrypoint.sh` for the routed yggdrasil addresses.

### Public Secondaries

```yaml
services:
  dnsdist:
    image: powerdns/dnsdist-21:2.1.2
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
    networks:
      dnsdistnet:
        ipv4_address: 172.31.66.11
    restart: unless-stopped
    volumes:
      - ./dnsdist.conf:/etc/dnsdist/conf.d/10-encrypted-dns.conf:ro
      - ./fullchain1.pem:/certs/fullchain.pem:ro
      - ./privkey1.pem:/certs/privkey.pem:ro
    security_opt:
      - no-new-privileges
    read_only: true
    cap_drop:
      - ALL
    ports:
      - "IPv4:53:53/tcp"
      - "IPv4:53:53/udp"
      - "IPv4:853:853/tcp"
      - "IPv4:853:853/udp"
      - "[IPv6]:53:53/tcp"
      - "[IPv6]:53:53/udp"
      - "[IPv6]:853:853/tcp"
      - "[IPv6]:853:853/udp"
  knot-secondary:
    image: knot
    build:
      context: .
      dockerfile: ./Dockerfile_knot
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
    networks:
      dnsdistnet:
        ipv4_address: 172.31.66.10
      xfrnet:
        ipv6_address: YGG_SUBNET_5::2
    restart: unless-stopped
    volumes:
      - ./knot.conf:/config/knot.conf:ro
      - ./secondary2.lan.crt:/etc/knot/pki/ns2.crt:ro
      - ./secondary2.lan.key:/etc/knot/pki/ns2.key:ro
      - ./root_ca.crt:/etc/knot/pki/ca.crt:ro
      - ./knot-entrypoint.sh:/knot-entrypoint.sh:ro
      - knot-storage:/storage:rw
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /rundir:rw,noexec,nosuid,size=64m
      - /tmp:rw,noexec,nosuid,size=64m,mode=1777
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
      - DAC_OVERRIDE
    entrypoint: ["/knot-entrypoint.sh"]
  yggdrasil:
    image: yggdrasil
    build:
      context: .
    deploy:
      resources:
        limits:
          memory: 384M
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
    networks:
      xfrnet:
        ipv6_address: YGG_SUBNET_5::10
    ports:
      - "47401:47401/tcp"
    restart: unless-stopped
    volumes:
      - ./yggdrasil-xfr2.conf:/etc/yggdrasil.conf:ro
    security_opt:
      - no-new-privileges
    read_only: true
    tmpfs:
      - /var/run:rw,noexec,nosuid,size=16m
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    sysctls:
      net.ipv6.conf.all.forwarding: "1"
    command: ["-useconffile", "/etc/yggdrasil.conf"]
networks:
  dnsdistnet:
    enable_ipv6: true
    driver: bridge
    ipam:
      config:
        - subnet: 172.31.66.0/24
  xfrnet:
    enable_ipv6: true
    driver: bridge
    driver_opts:
      com.docker.network.bridge.gateway_mode_ipv6: nat-unprotected
    ipam:
      config:
        - subnet: YGG_SUBNET_5::/64
volumes:
  knot-storage:
```

The compose file for the secondaries is more of the same. Quite similar to the primary. All the networking matters we previously discussed regarding yggdrasil still apply here. The only difference is that the secondaries are public-facing and so they will be listening for the actual DNS queries. Like previously mentioned, we will be listening on UDP and TCP port 53 for unencrypted DNS and on UDP and TCP port 853 for DoQ and DoT respectively. In our example secondary, we are also listening on both the public IPv4 and IPv6 of the secondary.

```lua
-- vim ft=lua
setACL({"0.0.0.0/0", "::/0"})

setLocal("0.0.0.0:53")
addLocal("[::]:53")

local certificate = "/certs/fullchain.pem"
local privateKey = "/certs/privkey.pem"

addTLSLocal("0.0.0.0:853", certificate, privateKey, {
    provider = "openssl",
    minTLSVersion = "tls1.3",
    maxConcurrentTCPConnections = 1000
})
addTLSLocal("[::]:853", certificate, privateKey, {
    provider = "openssl",
    minTLSVersion = "tls1.3",
    maxConcurrentTCPConnections = 1000
})

addDOQLocal("0.0.0.0:853", certificate, privateKey,
            {idleTimeout = 30, congestionControlAlgo = "cubic"})
addDOQLocal("[::]:853", certificate, privateKey,
            {idleTimeout = 30, congestionControlAlgo = "cubic"})

newServer({
    address = "172.31.66.10:53",
    name = "knot",
    tcpOnly = true,
    checkTCP = true,
    checkInterval = 10,
    checkName = "mydomain.org.",
    checkType = "SOA",
    mustResolve = true
})

setRingBuffersSize(100000, 10)

local abuse = dynBlockRulesGroup()

abuse:setQueryRate(100, 10, "Exceeded query rate", 60, DNSAction.Drop, 50)

abuse:setQTypeRate(DNSQType.ANY, 5, 10, "Exceeded ANY query rate", 60,
                   DNSAction.Drop)

function maintenance() abuse:apply() end
```

Above we can see our dnsdist.conf file. We are simply telling it to listen on all interfaces(docker) and then set up the listeners for UDP and TCP 53 and DoT and DoQ. Please note that the cert key-pair here will be the one that will be served on the internet so it needs to be something like a letsencrypt cert and not your own local CA's cert for obvious reasons.
Also, a gotcha that caught me. We have to tell dnsdist to listen on `0.0.0.0` and `[::]`. `[::]` doesn't mean both IPv4 and IPv6.
The `newServer` function(it's Lua!) sets up the upstream which in our case is knot. We also put in a simple test. Dnsdist will check its upstream every 10 seconds to make sure it's working properly.
The final part is for setting up some rate-limiting and blocking. Feel free to use whatever feels right for you.

```txt
template:
  - id: default
    zonefile-sync: -1
    zonefile-load: none
    journal-content: all

server:
    listen: 0.0.0.0@53
    listen-tls: YGG_SUBNET_5::2@853
    cert-file: /etc/knot/pki/ns2.crt
    key-file:  /etc/knot/pki/ns2.key
    ca-file:   /etc/knot/pki/ca.crt

key:
  - id: xfr-ns2.mydomain.org.
    algorithm: hmac-sha384
    secret: secret2

remote:
  - id: hidden-primary
    address: YGG_SUBNET_2::2@853
    via: YGG_SUBNET_5::2
    tls: on
    key: xfr-ns2.mydomain.org.
    cert-hostname: primary.lan

acl:
  - id: primary-notify
    address: YGG_SUBNET_2::2
    protocol: tls
    cert-hostname: primary.lan
    key: xfr-ns2.mydomain.org.
    action: notify

zone:
  - domain: mydomain.com.
    storage: /var/lib/knot/zones
    master: hidden-primary
    acl: primary-notify
  - domain: mydomain.org.
    storage: /var/lib/knot/zones
    master: hidden-primary
    acl: primary-notify
```

Some sections are very similar here to the primary's.
On the server section, we are also listening on port 53 because that's where dnsdist will be sending the DNS queries.
The final difference is in the zone section. The `master: something` part is what actually determines who's a primary and who's a secondary.

```sh
#!/bin/sh
set -ex

ip -6 route replace YGG_SUBNET_2::2/128 via YGG_SUBNET_5::10

exec knotd -c /config/knot.conf
```

```txt
{
  PrivateKey: private-key
  Peers: []
  InterfacePeers: {}
  Listen: [
  tls://0.0.0.0:47401?password=password
  ]
  AllowedPublicKeys: [
  PRIMARY_KNOT_YGG2_PUBKEY
  ]
  MulticastInterfaces: []
  GroupPassword: "grouppassword"
  IfName: auto
  IfMTU: 65535
  NodeInfoPrivacy: false
  NodeInfo: {}
}
```

The yggdrasil config is also a tad bit different here. We now have a listen address and allowed keys entry but no peers configured.

### Glue records, DS records, Bind Zonefiles

When we get here, we should have set up everything and have had them running for a while just to make sure things are working smoothly and all because you don't want to start debugging after migrating your authoritative DNS servers. Plus after migration you will have to deal with validation failure since the keys have changed.
Anyways, that's what i did before migrating my authoritative DNS servers. Ran this dry for a week or two and made sure everything is working properly before migrating(there were problems, believe me.).

Also do please note that when migrating an existing signed domain to this setup with a newly generated KSK and ZSK, you should expect temporary validation failures on some resolvers. Cached DS records can still identify the previous provider’s KSK, preventing authentication of a DNSKEY record set signed only by our new KSK. Cached DNSKEY record sets can also lack our new ZSK, preventing verification of record signatures made with it. We cannot clear other resolvers’ caches ourselves. Keep DNSSEC signing enabled throughout the migration, update the parent’s DS records through your registrar to match the new KSK, and allow existing DS, DNSKEY and nameserver cache entries to expire before considering the migration complete.

Here's the final bit. You may need to set glue records for domains that have their nameserver hostnames inside the delegated zone(so for example, ns1.mydomain.org for mydomain.org). Why? Good question!
Think of it like this. Someone is trying to query for a record on your domain so they will go ask your authoritative nameservers but your authoritative nameservers are in the same zone for which they don't have the records otherwise they wouldn't be looking for those records. It becomes a chicken and egg problem.
That's where glue records come in. Your glue records will be served by your domain's TLD zone which is also the case for your DS records.

As for the DS records, DNSSEC uses a chain of trust, conceptually similar to X.509 certs. Your authoritative server signs your zone’s records, while the parent zone(your TLD) publishes and signs a DS record linking your zone’s KSK key into that chain of trust. We provide the DS records for the parent zone(you give them to your registrar and your registrar gives them to your parent zone), then they(the parent zone) sign them and serve them so that the chain of trust can be complete.
How you give these two record types to your domain's TLD depends on your registrar so I can't really give you a tutorial here. You will have to look that up yourself.

The glue records will contain your nameservers' hostname, its IPv4 and/or IPv6.

Domains whose nameserver hostnames are outside the delegated zone can just set NS records.

As for your DS records you can run:

```sh
keymgr <zone> ds
```

For the domain this blog is being hosted on we get:

```txt
terminaldweller.com. DS 3363 14 2 7c9ff7a02a8d7e5a6adca996153cff07c7db35bc2616d40c4077ff0e6f03e36e
terminaldweller.com. DS 3363 14 4 9efc280991f93652127ba515aadde41292afc9a4053bb6bd5566f1600acd0fa765a9d3e800c43326fccd1609fa95980e
```

The final note is regarding your DNS records. In my case i had to manually write my bind zonefiles since my registrar didn't have any automation feature(at least at the time and not that I knew of).
Writing bind zonefiles is out of scope for this post so we leave that to the reader.

## TODO

* add DDNS support. Our current setup assumes that we will be manually updating the zonefiles. This makes DDNS support problematic. We will need to enable updates and choose a compatible zonefile/journal workflow.

## Notes and References

* [Here](https://smallstep.com/blog/everything-pki/)'s a blog post from smallstep about PKI.

<div>
  <p> written by terminaldweller, proofread by an LLM</p>
  <p class="timestamp">timestamp:1791289485</p>
  <p class="version">version:1.0.0</p>
  <p class="rsslink">https://blog.terminaldweller.com/rss/feed</p>
  <p class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/anauthoritativednsserver.md</p>
</div>
<br>
