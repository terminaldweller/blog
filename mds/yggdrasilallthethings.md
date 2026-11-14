# Yggdrasil All The Things

## How we got here

First, let's talk about how I got here. That immediately raises the question, where is "here" here. Fair.
I've been playing around and trying different things in my home lab. In terms of securing it I mean. I started running my own local CA. Everything that is being served locally now has a proper X.509 cert chain that can actually be validated. Then I started thinking about the other protocols that are going around on the network. DHCP, DNS, NTP and ARP(I know there are more but at the time I thought about these 4, leaving the rest for later).
For both DNS and NTP we can use their secure variants even locally. Sure that is a possibility but my thinking was that, securing only one of them at a time, is securing only one of them at a time. Why not try to fix multiple ones in one fell swoop?
Then I thought of using yggdrasil. So basically we serve DNS and NTP over ygg(yggdrasil for short). There is nothing special about this other than the fact that if we have a device that is not able to run ygg, then it's going to be left out. Of course, we can serve both over the overlay and underlay network. I ended up doing that.
My next target was DHCP, DHCPv4 to be more precise. The problem with DHCP is that DHCP message authentication never really saw any sort of meaningful adoption. I tried implementing something similar using openwrt and addresswatch. That could tell me an address had changed, but it couldn’t authenticate a DHCP offer. Too much work for what I wanted.
Then my next thought was, hey lets use ygg here again. The first obvious problem that we would run into is that we can't. DHCPv4 uses UDP, but a client normally starts by broadcasting on its local link. Ygg routes IPv6 packets, so it won’t carry that ethernet broadcast on its own. Then my line of thinking switched to DHCP4o6. That way I could have the DHCP for the ipv4 of my choosing go over ygg, and then we can apply it to the desired interface. The problem with that is that we need a client that actually implements that and also lets us apply the DHCPv4 we got to another interface. At the time of writing this, I could not find one such client. Also, for my case, I need a client that's available on debian, voidlinux, freebsd and openwrt. Kinda tricky. But anyways, like I said, I couldn't even find one.
Then it hit me. We could still use ygg. We can use ip6gretap or VXLAN, with the endpoint being ygg nodes. That gives us a virtual Layer 2 network, with each spoke’s traffic encrypted between the spoke and the hub. Then we use the overlay network as the service layer, i.e. , all the important services end up on here. Getting onto the physical LAN isn’t enough to inject frames into the overlay. The hub only accepts VXLAN from the Ygg addresses I’ve allowed. An admitted spoke, though, can still send a bogus ARP reply or DHCP offer. Also, this way, the underlying IP addresses of the nodes(ygg nodes) doesn't matter. Only the hub(hub and spoke, the router in my case)'s underlay IP address is significant. For all the other nodes, it does not matter(principally yes but we still will use DHCP static leases for more observability). Of course we can have a malicious node impersonate the router but that will not let them take over the hub's ygg identity or let them decrypt traffic that was not meant for them due to ygg's properties.
Our service layer built with ygg as its transport, will be where all the services are accessible. Again because of ygg's properties, each node has an identity represented by its ygg key-pair. We have admission control; what we lack though is policy between admitted spokes. Sure we can try to make something similar to it but it's going to be a lot of work.
There. That's what I meant when I said "here".

## Design

First off, we need to decide on how we're going to make our virtual layer 2 connections. I was mostly thinking between gretap and VXLAN. Ideally I wanted something that was supported on linux, openwrt, freebsd and openbsd. Gretap's not available on freebsd(only gre which is layer 3, unlike gretap which is layer 2). VXLAN is available on all of the mentioned OSes so I chose VXLAN.
The mesh's current design is hub and spoke, the spoke being the router itself which also serves as the DNS server, NTP server and DHCP server.
Each spoke sends ethernet frames to the hub over an encrypted ygg connection. If two spokes talk, the hub receives the frame from the first, bridges it, and sends it over a second encrypted connection to the other. Someone on the physical LAN can see that the nodes are talking, but can’t read the inner frame. The hub can. That’s intentional: it gives us one place to filter traffic between spokes. That's how(and where) we are going to implement our ACLs.

## "Service layer"

The implementation is pretty straightforward. We just make the VXLAN interface on the hub and spoke. In my case, the hub is running openwrt and the spoke in question uses NetworkManager.
On both devices, we allow traffic from each other over ygg through the firewall.
Please note that even though that we use VXLAN, each node will have its own VXLAN interface on the hub. This allows for cleaner filtering/ACL on the hub side.

I’m using static addresses in the examples below. The overlay can carry DHCPv4, but it doesn’t change how the devices get their physical LAN addresses.

### Openwrt

```sh
uci set network.overlay_bridge='device'
uci set network.overlay_bridge.name='br-overlay'
uci set network.overlay_bridge.type='bridge'
uci set network.overlay_bridge.bridge_empty='1'
uci set network.overlay_bridge.mtu='1500'
uci add_list network.overlay_bridge.ports='vx_spoke23'

uci set network.overlay='interface'
uci set network.overlay.device='br-overlay'
uci set network.overlay.proto='static'
uci set network.overlay.ipaddr='192.168.100.1'
uci set network.overlay.netmask='255.255.255.0'
uci set network.overlay.defaultroute='0'
uci set network.overlay.delegate='0'

uci set network.vx_spoke23='interface'
uci set network.vx_spoke23.proto='vxlan6'
uci set network.vx_spoke23.tunlink='ygg0'
uci set network.vx_spoke23.ip6addr='201:b88a:3806:b893:4cd6:60d3:efb5:5f59'
uci set network.vx_spoke23.peer6addr='200:1997:bff:8bc9:4929:ad2c:1173:632f'
uci set network.vx_spoke23.vid='123'
uci set network.vx_spoke23.port='4789'
uci set network.vx_spoke23.learning='0'
uci set network.vx_spoke23.mtu='1500'

uci commit network
ubus call network reload
```

```sh
uci set firewall.vxlan_spokes='rule'
uci set firewall.vxlan_spokes.name='Allow VXLAN over Yggdrasil from authorized spokes'
uci set firewall.vxlan_spokes.src='ygg'
uci set firewall.vxlan_spokes.family='ipv6'
uci set firewall.vxlan_spokes.proto='udp'
uci set firewall.vxlan_spokes.dest_ip='201:b88a:3806:b893:4cd6:60d3:efb5:5f59'
uci set firewall.vxlan_spokes.dest_port='4789'
uci set firewall.vxlan_spokes.target='ACCEPT'

uci add_list firewall.vxlan_spokes.src_ip="200:1997:bff:8bc9:4929:ad2c:1173:632f"

uci commit firewall
/etc/init.d/firewall reload
```

### Linux

```sh
# linux
sudo nmcli connection add type vxlan \
    con-name vxlan-ygg-hub ifname vx-hub \
    vxlan.parent ygg0 \
    vxlan.id 123 \
    vxlan.local 200:1997:bff:8bc9:4929:ad2c:1173:632f \
    vxlan.remote 201:b88a:3806:b893:4cd6:60d3:efb5:5f59 \
    vxlan.destination-port 4789 \
    vxlan.learning no \
    802-3-ethernet.mtu 1500 \
    ipv4.method manual \
    ipv4.addresses 192.168.100.139/24 \
    ipv4.never-default yes \
    ipv6.method disabled \
    connection.autoconnect yes \
    connection.autoconnect-retries 0

sudo nmcli connection up vxlan-ygg-hub
```

```sh
sudo ufw allow in on ygg0 \
    from 201:b88a:3806:b893:4cd6:60d3:efb5:5f59 \
    to any port 4789 proto udp \
    comment 'VXLAN over Yggdrasil from hub'
```

### Freebsd

One note regrading the freebsd vxlan setup. On my FreeBSD 15.1 hosts, the hub captured incoming vxlan packets with a zero outer UDP/IPv6 checksum. After disabling the port-specific zero-checksum exception, the capture showed a valid checksum and ARP resolved.

Below, we are configuring a second node for freebsd. The above steps on the openwrt side must also be done for this done as well.

```sh
# freebsd
ifconfig vxlan0 create
ifconfig vxlan0 \
    vxlanid 110 \
    vxlanlocal 200:c85c:8ab1:597f:fa6f:c641:ea18:588d \
    vxlanremote 201:b88a:3806:b893:4cd6:60d3:efb5:5f59 \
    vxlanlocalport 4789 vxlanremoteport 4789 \
    -vxlanlearn mtu 1500

ifconfig vxlan0 inet 192.168.100.69/24 up

# we need this for freebsd to generate the vxlan udp checksums
sysctl net.inet6.udp6.rfc6935_port=0
```

```sh
cat > /usr/local/etc/vxlan-ygg.conf <<'EOF'
LOCAL_YGG='200:c85c:8ab1:597f:fa6f:c641:ea18:588d'
OVERLAY_IP='192.168.100.69'
VNI='110'
EOF
```

```sh
mkdir -p /usr/local/libexec

cat > /usr/local/libexec/vxlan-ygg <<'EOF'
#!/bin/sh

PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/local/sbin:/usr/local/bin
export PATH

. /usr/local/etc/vxlan-ygg.conf

HUB_YGG='201:b88a:3806:b893:4cd6:60d3:efb5:5f59'
last_owner=''

remove_vxlan()
{
    if ifconfig vxlan0 >/dev/null 2>&1; then
        ifconfig vxlan0 destroy
    fi
}

trap 'exit 0' TERM INT
trap 'remove_vxlan' EXIT

while :; do
    ygg_info="$(ifconfig ygg0 2>/dev/null)"
    owner="$(printf '%s\n' "$ygg_info" |
        awk '/Opened by PID/ {print $NF}')"
    address="$(printf '%s\n' "$ygg_info" |
        awk -v expected="$LOCAL_YGG" \
            '$1 == "inet6" && $2 == expected {print $2}')"

    if [ -z "$owner" ] || [ -z "$address" ]; then
        if [ -n "$last_owner" ]; then
            remove_vxlan
            last_owner=''
        fi
        sleep 2
        continue
    fi

    vx_info="$(ifconfig vxlan0 2>/dev/null)"
    vx_address="$(printf '%s\n' "$vx_info" |
        awk -v expected="$OVERLAY_IP" \
            '$1 == "inet" && $2 == expected {print $2}')"

    if [ "$owner" != "$last_owner" ] || [ -z "$vx_address" ]; then
        remove_vxlan

        if ifconfig vxlan0 create &&
           ifconfig vxlan0 \
               vxlanid "$VNI" \
               vxlanlocal "$LOCAL_YGG" \
               vxlanremote "$HUB_YGG" \
               vxlanlocalport 4789 \
               vxlanremoteport 4789 \
               -vxlanlearn mtu 1500 &&
           ifconfig vxlan0 inet "$OVERLAY_IP/24" up &&
           sysctl net.inet6.udp6.rfc6935_port=0 >/dev/null; then
            last_owner="$owner"
            logger -t vxlan-ygg \
                "vxlan0 ready: $OVERLAY_IP/24, VNI $VNI, Yggdrasil PID $owner"
        else
            logger -t vxlan-ygg "VXLAN setup failed; retrying"
            remove_vxlan
            last_owner=''
            sleep 5
            continue
        fi
    fi

    # VXLAN startup can reset this host-wide setting.
    if [ "$(sysctl -n net.inet6.udp6.rfc6935_port)" != '0' ]; then
        sysctl net.inet6.udp6.rfc6935_port=0 >/dev/null ||
            logger -t vxlan-ygg "Failed to enable UDP checksum generation"
    fi

    sleep 2
done
EOF

chmod 755 /usr/local/libexec/vxlan-ygg
chmod 600 /usr/local/etc/vxlan-ygg.conf
```

```sh
cat > /usr/local/etc/rc.d/vxlan_ygg <<'EOF'
#!/bin/sh

# PROVIDE: vxlan_ygg
# REQUIRE: NETWORKING yggdrasil
# KEYWORD: shutdown

. /etc/rc.subr

name="vxlan_ygg"
rcvar="vxlan_ygg_enable"

load_rc_config "$name"
: ${vxlan_ygg_enable:="NO"}

command="/usr/sbin/daemon"
pidfile="/var/run/vxlan_ygg.pid"
required_files="/usr/local/etc/vxlan-ygg.conf"
command_args="-f -S -T vxlan-ygg -R 5 -P ${pidfile} /usr/local/libexec/vxlan-ygg"

run_rc_command "$1"
EOF

chmod 755 /usr/local/etc/rc.d/vxlan_ygg

sh -n /usr/local/libexec/vxlan-ygg &&
sh -n /usr/local/etc/rc.d/vxlan_ygg &&
sysrc vxlan_ygg_enable=YES &&
service vxlan_ygg start
```

## Checking the Path

I originally used ping to check connectivity. Then I restarted Ygg on one node and, to my surprise, 192.168.100.1 still answered even though the VXLAN interface didn’t exist. ip route get 192.168.100.1 showed why: the packet was going via 192.168.1.1 on br-lan. I was reaching the right address over the wrong network. On the hub, I added two rules: one for LAN traffic addressed to the hub itself, and one for LAN traffic the hub would otherwise forward to another spoke.

```sh
uci batch <<'EOF'
set firewall.block_lan_overlay_input='rule'
set firewall.block_lan_overlay_input.name='Reject LAN access to overlay addresses'
set firewall.block_lan_overlay_input.src='lan'
set firewall.block_lan_overlay_input.dest_ip='192.168.100.0/24'
set firewall.block_lan_overlay_input.proto='all'
set firewall.block_lan_overlay_input.target='REJECT'

set firewall.block_lan_overlay_forward='rule'
set firewall.block_lan_overlay_forward.name='Reject LAN forwarding to overlay addresses'
set firewall.block_lan_overlay_forward.src='lan'
set firewall.block_lan_overlay_forward.dest='*'
set firewall.block_lan_overlay_forward.dest_ip='192.168.100.0/24'
set firewall.block_lan_overlay_forward.proto='all'
set firewall.block_lan_overlay_forward.target='REJECT'
EOF
uci commit firewall
/etc/init.d/firewall reload
```
To test the forwarding rule, I took VXLAN down on one spoke and pinged another at another address on 192.168.100.0/24. The hub’s forward_lan reject counter went from zero to three, one for each probe. None of the probes appeared on br-overlay. The packets reached the hub over the physical LAN, and the hub refused to forward them onto the overlay.

<div>
  <p> written by terminaldweller, proofread by an LLM</p>
  <p class="timestamp">timestamp:1794444811</p>
  <p class="version">version:1.0.0</p>
  <p class="rsslink">https://blog.terminaldweller.com/rss/feed</p>
  <p class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/yggdrasilallthethings.md</p>
</div>
<br>
