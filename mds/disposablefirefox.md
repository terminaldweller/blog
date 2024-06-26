# Making a Disposable Firefox Instance

We want to make a disposable firefox instance.<br/>
Why firefox? well the only other choice is chromium really. Mozilla are no choir boys either. Basically we are choosing between the lesser of two evils here. There is also the whole google killing off manifest v2.<br/>
Qutebrowser and netsurf are solid but for this one, we will choose something that has more compatibility.<br/>
Now let's talk about the requirements and goals for this lil undertaking of ours:

## Requirements and Goals

We want:

- the instance to be ephemeral. This will prevent any persistent threat to remain on the VM.
- the instance to be isolated from the host.
- to prevent our IP address from being revealed to the websites we visit.

We will not be:

- doing any fingerprint-resisting. In case someone wants to do it, here's a good place to start: [arkenfox's user.js](https://github.com/arkenfox/user.js/)
- we are trying to keep our IP from being revealed to the websites we visit. We don't care whether a VPN provider can be subpoenaed or not. Otherwise, needless to say, use your own VPN server but that will limit the IP choices you have. Trade-offs people, trade-offs. There is also the better choice, imho, which is use a SOCKS5 proxy.

## Implementation

### Isolation and Sandboxing

We will be practicing compartmentalization. This makes it harder for threats to spread. There are more than one way to do this in the current Linux landscape. We will be using a virtual machine and not a container. Needless to say, defense in depth is a good practice so in case your threat model calls for it, one could run firefox in a container inside the VM but for our purposes running inside a virtual machine is enough.<br/>
To streamline the process, we will be using vagrant to provision the VM. Like already mentioned, we will use Vagrant's plugin for libvirt to build/manage the VM which in turn will use qemu/kvm as the hypervisor.<br/>
We value transparency so we will use an open-source stack for the virtualisation: Vagrant+libvirt+qemu/kvm<br/>
The benefits of using an open-source backend include:

- we don't have to worry about any backdoors in the software. There is a big difference between "they **probably** don't put backdoors into their software" and "there are no backdoors on this piece of software"(the xz incident non-withstanding)
- we don't have to deal with very late and lackluster responses to security vulnerabilities

Yes. We just took shots at two specific hypervisors. If you know, you know.<br/>

Now lets move on to the base for the VM.<br/>
We need something small for two reasons: a smaller attack surface and a smaller memory footprint(yes. A smaller memory-footprint. We will talk about this a bit later).<br/>
So the choice is simple if we are thinking of picking a linux distro. We use an alpine linux base image. We could pick an openbsd base. That has the added benefit of the host and the guest not running the same OS which makes it harder for the threats to break isolation but for the current iteration we will be using alpine linux.<br/>

### IP Address Leak prevention

The choice here is rather simple:<br/>
We either decide to use a VPN or a SOCKS5 proxy. You could make your own VPN and or SOCKS5 proxy. This IS the more secure option but will limit the ip choices we have. If your threat model calls for it, then by all means, take that route. For my purposes using a VPN provider is enough. We will be using mullvad vpn. Specifically, we will be using the openvpn config that mullvad generates for us. We will not be using the mullvad vpn app mostly because a VPN app is creepy.<br/>
We will also be implementing a kill-switch for the VPN. In case the VPN fails at any point, we don't want to leak our IP address. A kill-switch makes sure nothing is sent out when the VPN fails.
We will use ufw to implement the kill-switch feature. This is similar to what [tails OS does](https://tails.net/contribute/design/#index18h3) as in, it tries to route everything through tor but it also blocks any non-tor traffic, thus ensuring there are no leaks. We will be doing the same.<br/>

### Non-Persistance

We are running inside a VM so in order to achieve non-persistence we could just make a new VM instance, run that and after we are done with the instance, we can just destroy it. We will be doing just that but we will be using a `tmpfs` filesystem and put our VM's disk on that. This has a couple of benefits:

- RAM is faster than disk. Even faster than an nvme drive
- RAM is volatile

One thing to be wary of is swap. In our case we will be using the newer `tmpfs` which will use swap if we go over our disk limit so keep this in mind while making the tmpfs mount. Please note that there are ways around this as well. One could use the older `ramfs` but in my case this is not necessary since I'm using zram for my host's swap solution. This means that the swap space will be on the RAM itself so hitting the swap will still mean we never hit the disk.<br/>

To mount a tmpfs, we can run:

```sh
sudo mount -t tmpfs -o size=4096M tmpfs /tmp/tmpfs
```

Remember we talked about a smaller memory footprint? This is why. An alpine VM with firefox on top of it is smaller both in disk-size and memory used(mostly because of alpine using libmusl instead of glibc).<br/>
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
ufw allow in on eth0 from 192.168.121.1 proto tcp
ufw allow out on eth0 to 192.168.121.1 proto tcp
# server block
ufw allow out on eth0 to 185.204.1.174 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.174 port 443 proto tcp
ufw allow out on eth0 to 185.204.1.176 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.176 port 443 proto tcp
ufw allow out on eth0 to 185.204.1.172 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.172 port 443 proto tcp
ufw allow out on eth0 to 185.204.1.171 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.171 port 443 proto tcp
ufw allow out on eth0 to 185.212.149.201 port 443 proto tcp
ufw allow in on eth0 from 185.212.149.201 port 443 proto tcp
ufw allow out on eth0 to 185.204.1.173 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.173 port 443 proto tcp
ufw allow out on eth0 to 193.138.7.237 port 443 proto tcp
ufw allow in on eth0 from 193.138.7.237 port 443 proto tcp
ufw allow out on eth0 to 193.138.7.217 port 443 proto tcp
ufw allow in on eth0 from 193.138.7.217 port 443 proto tcp
ufw allow out on eth0 to 185.204.1.175 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.175 port 443 proto tcp
echo y | ufw enable
```

First, we forcefully reset ufw. This makes sure we are starting from a known state.<br/>
Second, we disable all incoming and outgoing traffic. This makes sure our default policy for some unforseen scenario is to deny traffic leaving the VM.<br/>
Then we allow traffic through the VPN interface, tun0.<br/>
Finally, in my case and because of libvirt, we allow traffic to and from the libvirt bridge, which in my case in 192.168.121.1.<br/>
Then we add two rules for each VPN server. One for incoming and one for outgoing traffic:

```sh
ufw allow out on eth0 to 185.204.1.174 port 443 proto tcp
ufw allow in on eth0 from 185.204.1.174 port 443 proto tcp
```

`eth0` is the interface that originally had internet access. Now after denying it any access, we are allowing it to only talk to the VPN server on the server's port 443.<br/>
Needless to say, the IP addresses, the ports and the protocol(tcp/udp which we are not having ufw enforce) will depend on the VPN server and your provider.<br/>
Note: make sure you are not doing DNS request out-of-band in regards to your VPN. This seems to be a common mistake and some VPN providers don't enable sending the DNS requests through the VPN tunnel by default which means your actual traffic goes through the tunnel but you are kindly letting your ISP(if you have not changed your host's DNS servers) know where you are sending your traffic to.<br/>

After setting the rules, we enable ufw.<br/>

### Sudo-less NTFS

In order to make the process more streamlined and not mistakenly keep an instance alive we need to have a sudo-less NTFS mount for the VM.<br/>
Without sudo-less NTFS, we would have to type in the sudo password twice, once when the VM is being brought up and once when it is being destroyed. Imagine a scenario when you close the disposable firefox VM, thinking that is gone but in reality it needs you to type in the sudo password to destroy it, thus, keeping the instance alive.<br/>
The solution is simple. We add the following to `/etc/exports`:

```sh
"/home/user/share/nfs" 192.168.121.0/24(rw,no_subtree_check,all_squash,anonuid=1000,anongid=1000)
```

This will enable the VM to access `/home/user/share/nfs` without needing sudo.<br/>

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
    # name of the storage pool, mine is ramdisk.
    libvirt.storage_pool_name = 'ramdisk'
    libvirt.default_prefix = 'disposable-'
    libvirt.driver = 'kvm'
    # amount of memory to allocate to the VM
    libvirt.memory = '3076'
    # amount of logical CPU cores to allocate to the VM
    libvirt.cpus = 6
    libvirt.sound_type = nil
    libvirt.qemuargs value: '-nographic'
    libvirt.qemuargs value: '-nodefaults'
    libvirt.qemuargs value: '-no-user-config'
    # enabling a serial console just in case
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
    sudo apk add firefox-esr xauth font-dejavu wget openvpn unzip iptables ufw nfs-utils haveged tzdata
    mkdir -p /vagrant && \
      sudo mount -t nfs 192.168.121.1:/home/devi/share/nfs /vagrant
  SHELL

  config.vm.provision 'update-upgrade-privileged', type: 'shell', name: 'update-upgrade-privileged', privileged: true, inline: <<-SHELL
    set -ex
    sed -i 's/^#X11DisplayOffset .*/X11DisplayOffset 0/' /etc/ssh/sshd_config
    sed -i 's/^X11Forwarding .*/X11Forwarding yes/' /etc/ssh/sshd_config
    rc-service sshd restart

    ln -fs /usr/share/zoneinfo/UTC /etc/localtime

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
  SHELL

  config.vm.provision 'kill-switch', communicator_required: false, type: 'shell', name: 'kill-switch', privileged: true, inline: <<-SHELL
    # http://o54hon2e2vj6c7m3aqqu6uyece65by3vgoxxhlqlsvkmacw6a7m7kiad.onion/en/help/linux-openvpn-installation
    set -ex
    ufw --force reset
    ufw default deny incoming
    ufw default deny outgoing
    ufw allow in on tun0
    ufw allow out on tun0
    # allow local traffic through the libvirt bridge
    ufw allow in on eth0 from 192.168.121.1 proto tcp
    ufw allow out on eth0 to 192.168.121.1 proto tcp
    # server block
    ufw allow out on eth0 to 185.204.1.174 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.174 port 443 proto tcp
    ufw allow out on eth0 to 185.204.1.176 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.176 port 443 proto tcp
    ufw allow out on eth0 to 185.204.1.172 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.172 port 443 proto tcp
    ufw allow out on eth0 to 185.204.1.171 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.171 port 443 proto tcp
    ufw allow out on eth0 to 185.212.149.201 port 443 proto tcp
    ufw allow in on eth0 from 185.212.149.201 port 443 proto tcp
    ufw allow out on eth0 to 185.204.1.173 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.173 port 443 proto tcp
    ufw allow out on eth0 to 193.138.7.237 port 443 proto tcp
    ufw allow in on eth0 from 193.138.7.237 port 443 proto tcp
    ufw allow out on eth0 to 193.138.7.217 port 443 proto tcp
    ufw allow in on eth0 from 193.138.7.217 port 443 proto tcp
    ufw allow out on eth0 to 185.204.1.175 port 443 proto tcp
    ufw allow in on eth0 from 185.204.1.175 port 443 proto tcp

    echo y | ufw enable
  SHELL

  config.vm.provision 'mullvad-test', type: 'shell', name: 'test', privileged: false, inline: <<-SHELL
    set -ex
    curl --connect-timeout 10 https://am.i.mullvad.net/connected | grep -i "you\ are\ connected"
  SHELL
end
```

### Provisioning

We will be using the vagrant shell provisioner to prepare the VM.<br/>
The first provisioner names `update-upgrade` does what the name implies. It installs the required packages.<br/>
The next provisioner, `update-upgrade-privileged`, enables X11 forwarding on openssh, sets up openvpn as a service and starts it and finally sets the timezone to UTC.<br/>
The third provisioner, `kill-switch`, sets up our kill-switch using ufw.<br/>
The final provisioner runs the mullvad test for their VPN. Since at this point we have set up the kill-switch we wont leak our IP address to the mullvad website but that's not important since we are using our own IP address to connect to the mullvad VPN servers.<br/>

### Interface

how do we interface with our firefox instance. ssh or spice?<br/>
I have gone with ssh. In our case we use ssh's X11 forwarding feature. This choice is made purely out of convenience. You can go with spice.<br/>

### Timezone

We set the VM's timezone to UTC because it's generic.<br/>

### haveged

haveged is a daemon that provides a source of randomness for our VM. Look [here](https://www.kicksecure.com/wiki/Dev/Entropy#haveged).

#### QEMU Sandbox

From `man 1 qemu`:

```txt
-sandbox arg[,obsolete=string][,elevateprivileges=string][,spawn=string][,resourcecontrol=string]
	Enable Seccomp mode 2 system call filter. 'on' will enable syscall filtering and 'off' will disable it. The default is 'off'.
```

#### CPU Pinning

CPU pinning alone is not what we want. We want cpu pinning and then further isolating those cpu cores on the host so that only the VM runs on those cores. This will give us a better performance on the VM side but also provide better security and isolation since this will mitigate side-channel attacks based on the CPU(the spectre/metldown family, the gift that keeps on giving).<br/>
In my case, I've done what I can on the host-side to mitigate spectre/meltdown but I don't have enough resources to ping 6 logical cores to this VM. If you can spare the resources, by all means, please do.<br/>

### No Passthrough

We will not be doing any passthroughs. It is not necessarily a choice made because of security, but merely out of a lack of need for the performance benefit that hardware-acceleration brings.<br/>

## Launcher Script

```sh
#!/usr/bin/dash
set -x

sigint_handler() {
  local ipv4="$1"
  xhost -"${ipv4}"
  vagrant destroy -f
}

trap sigint_handler INT
trap sigint_handler TERM

working_directory="/home/devi/devi/vagrantboxes.git/main/disposable/"
cd ${working_directory} || exit 1

vagrant up
disposable_id=$(vagrant global-status | grep disposable | awk '{print $1}')
disposable_ipv4=$(vagrant ssh "${disposable_id}" -c "ip a show eth0 | grep inet | grep -v inet6 | awk '{print \$2}' | cut -d/ -f1 | tr -d '[:space:]'")

trap 'sigint_handler ${disposable_ipv4}' INT
trap 'sigint_handler ${disposable_ipv4}' TERM

echo  "got IPv4 ${disposable_ipv4}"
xhost +"${disposable_ipv4}"
ssh \
  -o StrictHostKeyChecking=no \
  -o Compression=no \
  -o UserKnownHostsFile=/dev/null \
  -X \
  -i".vagrant/machines/default/libvirt/private_key" \
  vagrant@"${disposable_ipv4}" \
  "XAUTHORITY=/home/vagrant/.Xauthority firefox-esr -no-remote" https://mullvad.net/en/check/
xhost -"${disposable_ipv4}"
vagrant destroy -f
```

The script is straightforward. It brings up the VM, and destroys it when the disposable firefox instance is closed.<br/>
Let's look at a couple of things that we are doing here:<br/>

- The shebang line: we are using `dash`, the debian almquist shell. It has a smaller attack surface. It's small but we don't need all the features of bash or zsh here so we use something "more secure".

- we add and remove the IP of the VM from the xhost list. This allows the instance to display the firefox window on the host's X server and after it's done, we remove it so we don't end up whitelisting the entire IP range(least privilege principle, remember?).
- we use `-o UserKnownHostsFile=/dev/null` to prevent the VM from adding to the host's known hosts file. There are two reasons why we do this here. One, the IP range is limited, we will eventually end up conflicting with another IP that lives on your hostsfile that was a live and well VM as some point but is now dead so libvirt will reassign its IP address to our disposable instance which will prompt ssh to tell you that it suspects there is something going on which will prevent the ssh command from completing successfully which will in turn result in the VM getting killed. Two, we will stop polluting the hostsfile by all the IPs of the disposable VM instances that we keep creating so that you won't have to deal with the same problem while running other VMs.
- we register a signal handler for `SIGTERM` and `SIGINT` so that we can destroy the VM after we created it and we one of those signals. This helps ensure a higher rate of confidence in the VM getting destroyed. This does not guarantee that. A `SIGKILL` will kill the script and that's that.

## Notes Regarding the Host

A good deal of security and isolation comes from the host specially in a scenario when you are running a VM on top of the host. This is an entirely different topic so we won't be getting into it but [here](https://kernsec.org/wiki/index.php/Kernel_Self_Protection_Project/Recommended_Settings) is a good place to start. Just because it's only a single line at the end of some random blogpost doesn't mean its not important. Take this seriously.<br/>

We are using somebody else's vagrant base image. Supply-chain attacks are a thing so it is very much better to use our own base image.<br/>
As a starting you can look [here](https://github.com/lavabit/robox/tree/master/scripts/alpine319). This is how the base image we are using is created.<br/>

<p>
  <div class="timestamp">timestamp:1719428898</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/disposablefirefox.md</div>
</p>
<br>
