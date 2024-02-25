# What to do with your DNS when ODoH's Trust-Me-Bruh Model doesn't work for you

DNS.<br/>
Domain Name System.<br/>

We all use it. We all need it. But most people are still using it like its the early 2000s.<br/>
What do I mean by that?<br/>
Ye good ole UDP on port 53.<br/>

And your ISP will tell ya you don't need to worry about your privacy because they swear on boy scout honor that they don't log your DNS queries. Right .... <br/>

It's 2024. We have come a long way. We have DoH, DoT, ODoH, DNSCrypt and more.<br/>

We're going to talk about all of these for a little bit and then finally I'm going to share what I am doing right now.<br/>

## Problem Statement

Plain jane DNS, i.e., sending your request using UDP without any sort of encryption, has been the norm for almost ever. Even right now that is what most people are doing.
That might have been oh-so-cool in the 80s but It doesn't fly anymore.
So we ended up with DoH and DoT. DNS-over-HTTPS and DNS-over-TLS. They are both self-explanatory. Instead of doing unencrypted requests over UDP, we do a TCP request using HTTPS or TLS.<br/>
So far so good. DoH and DoT are definitely improvements over [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) but let's take a step back and see what we are trying to defend against. Without a structure, we are not doing much more than just magic granted to us by the flying spaghetti monster.<br/>

Let's review our threat model.What are we trying to achieve here? What are the threats and who are the threat actors?
Who are we safeguarding our DNS queries against? Men-in-the-middle? Our internet provider? The authoritative DNS server that we use?

**_Statement_**: We want to have a **_private_** and **_anonymous_** DNS solution. That means:

**_Requirement 001_**:

- The DNS queries shall only be viewed by the authoritative DNS server(We can up this requirement later by running our own authoritative DNS server but for now we are going to stick with our current requirement).<br/>

This naturally means that your internet provider and other men-in-the-middle are not allowed to snoop on what we are querying.<br/>

**_Requirement 002_**:

- The DNS queries shall be anonymous. This means the authoritative DNS server that is getting our DNS queries shall not be able to identify the source of the query.

There is more than one way to "identify" the source of the query. We only mean the source as in the IP address that made the DNS query.<br/>

This second requirement is what ODoH is trying to solve. ODoH tries to separate the identity of the source of the DNS query from the query itself.<br/>
ODoH stands for oblivous DoH. It add an "oblivious" proxy in middle of the source of the DNS query and the server. This way the proxy can send the queries in bulk for example to try to mask who sent what when. I'm summarizing here but what ODoH is trying to do can be summarized by this:

- ODoH tries to separate the identity of the source of the query from the query itself by adding a proxy in the middle

Below you can see

```
        --- [ Request encrypted with Target public key ] -->
   +---------+             +-----------+             +-----------+
   | Client  +-------------> Oblivious +-------------> Oblivious |
   |         <-------------+   Proxy   <-------------+  Target   |
   +---------+             +-----------+             +-----------+
       <-- [   Response encrypted with symmetric key   ] ---
```

[ripped straight from RFC 9230](https://datatracker.ietf.org/doc/rfc9230/)

The main problem with this sort of a solution is that there is always an element of "trust-me-bruh" to the whole situation.

- How can we trust that the proxy provider and the server are not colluding?

We could run our own oblivious proxy but then if it's just you and your friends using the proxy, then your proxy is not obfuscating much, is it now?<br/>
And then there is the "oblivious" aspect of the solution. How can we enforce that? How can you verify that?<br/>

```
Trust Me Bruh. We don't Log anything ...
```

We have cryptography, We have zk. I think we can do better than just blind trust.<br/>

Objectively speaking, and I'm not accusing anyone of anything so it's just a hypothetical but if someone would give me some money and they asked me to come up with a system which let's them practically monopolize access to DNS queries, I would propose ODoH.<br/>

It has enough mumbo jumbo tech jargon(end-to-end-encrypted, ...) to throw off your average layman and lul them into a false sense of security and privacy but it doesnt prevent the proxy and server provider from colluding. After all the technnical jargon, you end up with "it's safe" and "it's private" because "you can trust us". <br/>

Now we can see that DoH, DoT and ODoH are all better than baseline DNS queries over UDP without encryption but they can't satisfy both of our requirements.<br/>

## Solution

Now let's talk about the solution I at the time of writing this blog post.<br/>

DoH or DoT is good enough to satisfy `Requirement001` but they need something a little extra to be able to satisfy `Requirement002`.<br/>

For that, we use an anonymizing network like tor. DoT and DoH both work over TCP so we can use any SOCKS5 proxy here that ends up being a Tor proxy.<br/>
What I mean is you can use a the Tor running on your host or you can use `ssh -L` to use Tor running on a VPS. That way, your internet proviedr can't know you're using Tor at all.<br/>
With your DNS queries going over Tor, we can satisfy `Requirement002`.<br/>
Tor is not the only solution here but I use Tor. There is more than one anonimyzing network out there and there are protocols that do this also.<br/>

Right now we have an outline in our head:

- We need to only use TCP for DNS and send everything over a Tor SOCKS5 proxy.
- we will be using DoT or DoH. This will be useful in two ways. One we ensure we are using TCP for DNS which is what most SOCKS5 implementations support(even though they should support UDP because it's SOCKS5 and not SOCKS4 but that's another can of worms)

There is more than one way to do this but I have decided to use [dnscrypt-proxy](https://github.com/DNSCrypt/dnscrypt-proxy).<br/>
We will not be using dnscrypt for the dnscrypt protocol though you could elect to use that as the underlying DNS protocol.<br/>
`dnscrypt-proxy` lets's us use a SOCKS5 proxy through which the DNS queries will be sent. We will use a Tor SOCKS5 proxy here. You can choose which protocols should be enabled and which ones should be disabled.<br/>
There are two points:

- one, enable the tcp only option, since we dont want to use plain jane UDP queries.
- two, I have asked `dnscrypt-proxy` to only use DNS servers that support DNSSEC.

I recommend going through all the available options in the `dnscrypt-proxy.toml` file. It is one of those config files with comments so it's pretty sweet. There are quite a few useful options in there that you might care about depending on your needs.<br/>

### Implementation

Right now I run `dnscrypt-proxy` on a small alpine linux VM. I made it fancier by running the VM on a tmpfs storage pool. Basically mine is running entirely on RAM.<br/>
I used to have `dnscrypt-proxy` running on a raspberry pi and had my openwrt router forward DNS queries to that raspberry pi.<br/>
There is obviously no best solution here. Just pick one that works for you.<br/>
Here you can find the vagrantfile I use for the DNS VM I use:<br/>

```ruby
ENV['VAGRANT_DEFAULT_PROVIDER'] = 'libvirt'
Vagrant.require_version '>= 2.2.6'
Vagrant.configure('2') do |config|
  config.vm.box = 'generic/alpine319'
  config.vm.box_version = '4.3.12'
  config.vm.box_check_update = false
  config.vm.hostname = 'virt-dns'

  # ssh
  config.ssh.insert_key = true
  config.ssh.keep_alive = true
  config.ssh.keys_only = true

  # timeouts
  config.vm.boot_timeout = 300
  config.vm.graceful_halt_timeout = 60
  config.ssh.connect_timeout = 30

  # shares
  config.vm.synced_folder '.', '/vagrant', type: 'nfs', nfs_version: 4, nfs_udp: false

  config.vm.network :private_network, :ip => '192.168.121.93' , :libvirt__domain_name => 'devidns.local'

  config.vm.provider 'libvirt' do |libvirt|
    libvirt.storage_pool_name = 'ramdisk'
    libvirt.default_prefix = 'dns-'
    libvirt.driver = 'kvm'
    libvirt.memory = '256'
    libvirt.cpus = 2
    libvirt.sound_type = nil
    libvirt.qemuargs value: '-nographic'
    libvirt.qemuargs value: '-nodefaults'
    libvirt.qemuargs value: '-no-user-config'
    libvirt.qemuargs value: '-serial'
    libvirt.qemuargs value: 'pty'
    libvirt.random model: 'random'
  end

  config.vm.provision 'reqs', type: 'shell', name: 'reqs-install', inline: <<-SHELL
    sudo apk update &&\
      sudo apk upgrade &&\
      sudo apk add tor dnscrypt-proxy privoxy tmux
  SHELL

  config.vm.provision 'reqs-priv', type: 'shell', name: 'reqs-priv-install', privileged: true, inline: <<-SHELL
    cp /vagrant/torrc /etc/tor/torrc
    cp /vagrant/dnscrypt-proxy.toml /etc/dnscrypt-proxy/dnscrypt-proxy.toml
    #cp /vagrant/config /etc/privoxy/config
    rc-service tor start
    sleep 1
    #rc-service privoxy start
    #sleep 1
    rc-service dnscrypt-proxy start
  SHELL
end
```

It's pretty straightforward. We use an alpine linux VM as base. Make a new interface on the VM with a static IP and have `dnscrypt-proxy` receive DNS queries through that interface and IP only. I don't change the port number(53) because of certain applications(you know who you are) refusing to accept port for a DNS server's address.<br/>
You could also make it spicier by using `privoxy`. Maybe I make a post about that later.<br/>

<p>
  <div class="timestamp">timestamp:1708814484</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/DNS.md</div>
</p>
<br>
