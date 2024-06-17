# Making a Disposable Firefox Instance

We want to make a disposable firefox instance.<br/>
Why firefox? well the only other choice is chromium really. Mozilla are no choir boys either. Basically we are choosing between the lesser of two evils here. Firefox it is then.<br/>
Qutebrowser and netsurf are solid but for this one, I want something that has more compatability.<br/>
Now let's talk about the requirements and goals for this lil undertaking of ours:

## Requirements and Goals

We want:

- the instance to be ephemeral. This will prevent any persistant threat to remain on the VM.
- the instance to be isolated from the host.
- to prevent our IP address from being revealed to the websites we visit.

We will not be:

- doing any fingerprint-resisting. In case someone wants to do it, here's a good place to start: [arkenfox's user.js](https://github.com/arkenfox/user.js/)
- we are trying to keep our IP from being revealed to the websites we visit. We don't care whether a VPN provider can be subpoenaed or not. Otherwise, needless to say, use your own VPN server but will limit the IP choices. trade-offs people, trade-offs.

## Implementation

### Isolation and Sandboxing

We will be practicing compertmentalization. This makes it harder for threats to spread. There are more than one way to do this in the current Linux landscape. We will be using a virtual machine and not a container. Needless to say, defense in depth is a good practice so in case your threat model calls for it, one could run firefox in a container inside the VM but for our purposes running inside a virtual machine is enough.<br/>
To streamline the process, we will be using vagrant to provision the VM. like already mentioned, we will use Vagrant's plugin for libvirt to build/manage the VM which in turn will use qemu/kvm as the hypervisor.<br/>
We value transparency so we will use an open-source stack for the virtualization: Vagrant+libvirt+qemu/kvm<br/>
The benefits of using an open-source backend include:

- we don't have to worry about any backdoors in the software
- we don't have to deal with very late and lackluster responses to security vulnerabilities

Yes. we just took shots at two specific hypervisors. If you know, you know.<br/>

Now lets move on to the base for the VM.<br/>
We need something small for two reasons: a smaller attack surface and a smaller memory footprint(yes. a smaller memory-footrpint. we will talk about this a bit later).<br/>
So the choice is simple if we are thinking of picking a linux distro. We use an alpine linux base image. We could pick an openbsd base. That has the added benefit of the host and the guest not running the same OS which makes it harder for the threats to break isolation but for the current iteration we will be using alpine linux.<br/>

### IP Address Leak prevention

The choice here is rather simple:<br/>
We either decide to use a VPN or a SOCKS5 proxy. You could make your own VPN and or SOCKS5 proxy. This IS the more secure option but will limit the ip choices we have. If your threat model calls for it, then by all means, take that route. For my purposes using a VPN provider is enough. We will be using mullvad vpn. Specifically, we will be using the openvpn config that mullvad generates for us. We will not be using the mullvad vpn app mostly because a VPN app is creepy.<br/>
We will also be implementing a kill-switch for the VPN. in case the VPN fails at any point, we don't want to leak our IP address. A kill-switch makes sure nothing is sent out when the VPN fails.
We will use ufw to implement the kill-switch feature.<br/>

### Non-Persistance

We are running inside a VM so in order to achieve non-persistance we could just make a new VM instance, run that and after we are done with the instance, we can just destroy it. We will be doing just that but we will be using a `tmpfs` filesystem and put our VM's disk on that. This has a couple of benefits:

- RAM is faster than disk. Even faster than an nvme drive
- RAM is volatile

One thing to be wary of is swap. In our case we will be using the newser `tmpfs` which will use swap if we go over our disk limit so keep this in mind while making the tmpfs mount. Please note that there are ways around this as well. One could use the older `ramfs` but in my case this is not necessary since I'm using zram for my host's swap solution. This means that the swap space will be in the RAM itself so hitting the swap will still mean we never hit the disk.<br/>

To mount a tmpfs, we can run:

```sh
sudo mount -t tmpfs -o size=4096M tmpfs /tmp/tmpfs
```

The above command will mount a 4GB tmpfs on `/tmp/tmpfs`.<br/>
Next we want to create a new storage pool for libvirt so that we can specify the VM to use that in Vagrant.

```sh
virsh pool-define-as tmpfs_pool /tmp/tmpfs
```

and then start the pool:

```sh
virsh pool-start tmpfs_pool
```

## Implementing the Kill-Switch Using UFW

The concept is simple. We want to stop sending packets to any external IP address once the VPN is down.<br/>
In order to achieve this, we will fulfill a much stricter requirement. We will go for a tails-like setup, in that the only allowed external traffic will be to the IP address of the VPN server(s).<br/>
Here's what that will look like:<br/>

```sh
ufw --force reset
ufw default deny incoming
ufw default deny outgoing
ufw allow in on tun0
ufw allow out on tun0
# enable libvirt bridge
ufw allow in on eth0 from 192.168.121.1
ufw allow out on eth0 to 192.168.121.1
# server block
ufw allow out on eth0 to 185.204.1.174 port 443
ufw allow in on eth0 from 185.204.1.174 port 443
ufw allow out on eth0 to 185.204.1.176 port 443
ufw allow in on eth0 from 185.204.1.176 port 443
ufw allow out on eth0 to 185.204.1.172 port 443
ufw allow in on eth0 from 185.204.1.172 port 443
ufw allow out on eth0 to 185.204.1.171 port 443
ufw allow in on eth0 from 185.204.1.171 port 443
ufw allow out on eth0 to 185.212.149.201 port 443
ufw allow in on eth0 from 185.212.149.201 port 443
ufw allow out on eth0 to 185.204.1.173 port 443
ufw allow in on eth0 from 185.204.1.173 port 443
ufw allow out on eth0 to 193.138.7.237 port 443
ufw allow in on eth0 from 193.138.7.237 port 443
ufw allow out on eth0 to 193.138.7.217 port 443
ufw allow in on eth0 from 193.138.7.217 port 443
ufw allow out on eth0 to 185.204.1.175 port 443
ufw allow in on eth0 from 185.204.1.175 port 443
echo y | ufw enable
```

First off we forcefully reset ufw. This makes sure we ware starting from a known state.<br/>
Second, we disable all incoming and outgoing traffic. This makes sure our default policy for unforseen scenarios is to deny traffic leaving the VM.<br/>
Then we allow traffic through the VPN interface, tun0.<br/>
Finally, in my case and beacuse Vagrant, we allow traffic to and from the libvirt bridge, which in my case in 192.168.121.1.<br/>
Then we add two rules for each VPN server. One for incoming and one for outgoing traffic:

```sh
ufw allow out on eth0 to 185.204.1.174 port 443
ufw allow in on eth0 from 185.204.1.174 port 443
```

`eth0` is the interface that originally had internet access. Now after denying it any access, we are allowing it to only talk to the VPN server on the server's port 443.<br/>
Please keep in mind that the addresses, the port and even the protocol(tcp/udp) will depend on the VPN server.<br/>

after setting the rules we enable ufw.<br/>

## The Vagrantfile

Here is the Vagrantfile that will be used to provision the VM:

```ruby
ENV['VAGRANT_DEFAULT_PROVIDER'] = 'libvirt'
Vagrant.require_version '>= 2.2.6'
Vagrant.configure('2') do |config|
  config.vm.box = 'generic/alpine319'
  config.vm.box_version = '4.3.12'
  config.vm.box_check_update = false
  config.vm.hostname = 'virt-disposable'

  # ssh
  config.ssh.insert_key = true
  config.ssh.keep_alive = true
  config.ssh.keys_only = true

  # timeouts
  config.vm.boot_timeout = 300
  config.vm.graceful_halt_timeout = 60
  config.ssh.connect_timeout = 15

  config.vm.provider 'libvirt' do |libvirt|
    libvirt.storage_pool_name = 'tmpfs_pool'
    libvirt.default_prefix = 'disposable-'
    libvirt.driver = 'kvm'
    libvirt.memory = '3076'
    libvirt.cpus = 6
    libvirt.sound_type = nil
    libvirt.qemuargs value: '-nographic'
    libvirt.qemuargs value: '-nodefaults'
    libvirt.qemuargs value: '-no-user-config'
    libvirt.qemuargs value: '-serial'
    libvirt.qemuargs value: 'pty'
    libvirt.qemuargs value: '-sandbox'
    libvirt.qemuargs value: 'on'
    libvirt.random model: 'random'
  end

  config.vm.provision 'update-upgrade', type: 'shell', name: 'update-upgrade', inline: <<-SHELL
    set -ex
    sudo apk update && \
      sudo apk upgrade
    sudo apk add tor torsocks firefox-esr xauth font-dejavu wget openvpn unzip iptables bubblewrap apparmor ufw nfs-utils haveged tzdata
    wget -q https://addons.mozilla.org/firefox/downloads/file/4228676/foxyproxy_standard-8.9.xpi
    mv foxyproxy_standard-8.9.xpi foxyproxy@eric.h.jung.xpi
    mkdir -p ~/.mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/
    mv foxyproxy@eric.h.jung.xpi ~/.mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/
    mkdir -p /vagrant && \
      sudo mount -t nfs 192.168.121.1:/home/devi/share/nfs /vagrant
  SHELL

  config.vm.provision 'update-upgrade-privileged', type: 'shell', name: 'update-upgrade-privileged', privileged: true, inline: <<-SHELL
    set -ex
    sed -i 's/^#X11DisplayOffset .*/X11DisplayOffset 0/' /etc/ssh/sshd_config
    sed -i 's/^X11Forwarding .*/X11Forwarding yes/' /etc/ssh/sshd_config
    rc-service sshd restart

    #rc-update add tor default
    cp /vagrant/torrc /etc/tor/torrc
    rc-service tor start

    ln -s /usr/share/zoneinfo/UTC /etc/localtime

    #rc-update add openvpn default
    mkdir -p /tmp/mullvad/ && \
      cp /vagrant/mullvad_openvpn_linux_fi_hel.zip /tmp/mullvad/ && \
      cd /tmp/mullvad && \
      unzip mullvad_openvpn_linux_fi_hel.zip && \
      mv mullvad_config_linux_fi_hel/mullvad_fi_hel.conf /etc/openvpn/openvpn.conf && \
      mv mullvad_config_linux_fi_hel/mullvad_userpass.txt /etc/openvpn/ && \
      mv mullvad_config_linux_fi_hel/mullvad_ca.crt /etc/openvpn/ && \
      mv mullvad_config_linux_fi_hel/update-resolv-conf /etc/openvpn && \
      chmod 755 /etc/openvpn/update-resolv-conf
    modprobe tun
    echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.d/ipv4.conf
    sysctl -p /etc/sysctl.d/ipv4.conf
    rc-service openvpn start || true
    sleep 1

    cp /vagrant/bw_firefox /usr/bin/
  SHELL

  config.vm.provision 'kill-switch', communicator_required: false, type: 'shell', name: 'kill-switch', privileged: true, inline: <<-SHELL
    # http://o54hon2e2vj6c7m3aqqu6uyece65by3vgoxxhlqlsvkmacw6a7m7kiad.onion/en/help/linux-openvpn-installation
    set -ex
    ufw --force reset
    ufw default deny incoming
    ufw default deny outgoing
    ufw allow in on tun0
    ufw allow out on tun0
    # enable libvirt bridge
    ufw allow in on eth0 from 192.168.121.1
    ufw allow out on eth0 to 192.168.121.1
    # server block
    ufw allow out on eth0 to 185.204.1.174 port 443
    ufw allow in on eth0 from 185.204.1.174 port 443
    ufw allow out on eth0 to 185.204.1.176 port 443
    ufw allow in on eth0 from 185.204.1.176 port 443
    ufw allow out on eth0 to 185.204.1.172 port 443
    ufw allow in on eth0 from 185.204.1.172 port 443
    ufw allow out on eth0 to 185.204.1.171 port 443
    ufw allow in on eth0 from 185.204.1.171 port 443
    ufw allow out on eth0 to 185.212.149.201 port 443
    ufw allow in on eth0 from 185.212.149.201 port 443
    ufw allow out on eth0 to 185.204.1.173 port 443
    ufw allow in on eth0 from 185.204.1.173 port 443
    ufw allow out on eth0 to 193.138.7.237 port 443
    ufw allow in on eth0 from 193.138.7.237 port 443
    ufw allow out on eth0 to 193.138.7.217 port 443
    ufw allow in on eth0 from 193.138.7.217 port 443
    ufw allow out on eth0 to 185.204.1.175 port 443
    ufw allow in on eth0 from 185.204.1.175 port 443

    echo y | ufw enable
  SHELL

  config.vm.provision 'mullvad-test', type: 'shell', name: 'test', privileged: false, inline: <<-SHELL
    set -ex
    curl --connect-timeout 10 https://am.i.mullvad.net/connected | grep -i "you\ are\ connected"
  SHELL
end
```

First let's talk about how we interface with our firefox instance. ssh or spice?<br/>
I have gone with ssh. In our case we use ssh's X11 forwarding feature. This will allow us to keep the size of the VM small.

### Timezone

We set the VM's timezone to UTC. That's the most generic one.

### haveged

haveged is a daemon that provides a source of randomness for our VM. Look [here](https://www.kicksecure.com/wiki/Dev/Entropy#haveged).

### VM Isolation

#### QEMU Sandbox

#### CPU Pinning

CPU pinning alone is not what we want. We want cpu pinning and then further isolating those cpu cores on the host so that only the VM runs on those cores. This will give us a better performance on the VM side but also provide better security and isolation since this will mitigate side-channel attacks based on the CPU(the spectre/metldown family, the gift that keeps on giving. thanks intel!).<br/>

### passwordless NFS

```txt
"/home/devi/share/nfs" 192.168.121.0/24(rw,no_subtree_check,all_squash,anonuid=1000,anongid=1000) 172.17.0.0/16(rw,no_subtree_check,all_squash,anonuid=1000,anongid=1000) 10.167.131.0/24(rw,no_subtree_check,all_squash,anonuid=1000,anongid=1000)
```

### No Passthrough

We could do a GPU passthrough to use hardware acceleration and be able to view 4k videos with this instance but I did not make this with such applications in mind so we won't be doing that.

## Launcher Script

```sh
#!/usr/bin/dash
set -x

working_directory="/home/devi/devi/vagrantboxes.git/main/disposable/"
cd ${working_directory} || exit 1

vagrant up
disposable_id=$(vagrant global-status | grep disposable | awk '{print $1}')
disposable_ipv4=$(vagrant ssh "${disposable_id}" -c "ip a show eth0 | grep inet | grep -v inet6 | awk '{print \$2}' | cut -d/ -f1 | tr -d '[:space:]'")
echo  "got IPv4 ${disposable_ipv4}"
xhost +"${disposable_ipv4}"
ssh \
  -o StrictHostKeyChecking=no \
  -o Compression=no \
  -X \
  -i".vagrant/machines/default/libvirt/private_key" \
  vagrant@"${disposable_ipv4}" \
  "XAUTHORITY=/home/vagrant/.Xauthority firefox-esr -no-remote" https://mullvad.net/en/check/
xhost -"${disposable_ipv4}"
vagrant destroy -f
```

## Notes Regarding the Host

A good deal of security and isolation comes from the host specially in a scenario when you are running a VM on top of the host. This is an entire topic so we won't be getting into it but [here](https://kernsec.org/wiki/index.php/Kernel_Self_Protection_Project/Recommended_Settings) is a good place to start. Just because it's only a single line at he end of some random blogpost doesn't mean its not important. Take this seriously.<br/>

<p>
  <div class="timestamp">timestamp:1718588927</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/disposablefirefox.md</div>
</p>
<br>
