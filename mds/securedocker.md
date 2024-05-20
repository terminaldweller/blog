# Docker, Linux, Security. Kinda.

We will be exploring some Linux features in the context of a docker application container. Another way of explaining it would be to say we will talk about how to make more secure application containers.
We will not talk about firewall and apparmor because they are tools that enhance security on the host in general and not specific to a docker application container. A secure host means a more secure application container but that is discussion for another post.<br/>
We will focus on Linux containers since FreeBSD containers are still experimental(see [here](https://wiki.freebsd.org/Docker) and [here](https://github.com/samuelkarp/runj)). Yes, windows containers exist.<br/>
We will not discuss performance. Here be performance penalties, but again that is not the focus of this post.<br/>

Before we begin, Linux docker containers are Linux. They are using most of the functionality that existed before application containers in the form of docker were a thing. Knowing Linux better means you know Linux Docker containers(application containers is a more correct term) better. We will see this point throughout this post.<br/>

## Base Image

We start with the first building block of a new docker image, The base image. By far the most used base images are the Alpine docker base image, followed by Debian and Ubuntu docker base images.
These distros have two major differences that we want to focus on:

- C standard library implementation
- the userspace utility implementation

Debian and Ubuntu(we are not forgetting that Ubuntu itself is a Debian derivative) both use glibc, as in gnu's [libc](https://www.gnu.org/software/libc/) implementation. Alpine uses [musl-libc](https://www.musl-libc.org/) as its C standard library implementation.<br/>
The major difference here which will come into play later on again is glibc has been around for much longer, so it has to keep backwards compatibility for a much longer period of time and for far more many things. Also the general attitude with the glibc team is that they have to support everything since if they don't then who will?<br/>
Libmusl on the other hand, does not try to support everything under the sun, a relatively newer project, comparatively, and, they keep their codebase lean.<br/>
As a result not all applications are supported by libmusl but a good number of them are.<br/>
In simpler terms, libmusl has a far smaller attack surface compared to glibc.<br/>

On to our second point, which is the cli utilities' implementation. Debian and Ubuntu use gnu's [Coreutils](https://www.gnu.org/software/coreutils/) while Alpine uses [Busybox](https://busybox.net/)(remember, we are talking about the most used application container bases. You can install a desktop version of Alpine with GNU coreutils).<br/>
Here we have the same situation as before, The GNU coreutils are bigger, do more and have a larger attack surface. Busybox is smaller, does not support as many features as GNU Coreutils but does support enough of them to make them useful. Needless to say, busybox is small and hence, it has a smaller attack surface.<br/>

To get a feel for how this plays out in the real world, you can look at some of the popular images that come in both Debian and Alpine flavours on dockerhub. Take a look at the number of reported vulnerabilities for both bases. The theme we observe is simple. The bigger the attack surface the bigger the number of vulnerabilities.<br/>

Alpine images are small, lean and functional, just like libmusl and busybox but there are still quite a few things on an alpine image that are extraneous. We can take them out and have a perfectly functioning application container.<br/>

That's how we get [distroless](https://github.com/GoogleContainerTools/distroless).<br/>
Distroless base images follow the same pattern as alpine base docker images, as in, less functionality while still keeping enough functionality to be able to do the job and minimize the attack surface.
Minimizing a base image like this means that the base images are very specialized so we have base images for golang, python, java and the like.<br/>

## Dokcer Runtimes

By default docker uses containerd which in turn uses runc for the runtime. There are two additional runtimes that we want to focus on who try to provide a more secure runtime environment for docker.

- gvisor
- kata

### gvisor

gVisor creates a sandbox environment. Containers interact with the host through this sandboxed environment.<br/>
gvisor has two components. Gofer and Sentry. Sentry is a kernel that runs the containers and intercepts and responds to system calls made by the application so as not to have an application directly control the syscalls that it makes.<br/>
Gofer handles filesystem access(not /proc) for the application.<br/>
The application is a regular application. gVisor aims to provide an environment equivalent to Linux 4.4. gvisor presently does not implement every system call, `/proc` file or `/sys` file.<br/>
Every sandbox environment gets its own instance of Sentry. Every container in the sandbox gets its own instance of Gofer.<br/>
gVisor currently does not support all system calls. You can find the list of supported system calls for amd64 [here](https://gvisor.dev/docs/user_guide/compatibility/linux/amd64/).<br/>

```
  -------------
  |Application|
  -------------
       |system calls
       |
    --------   9p    -------
    |Sentry|<------->|Gofer|
    --------         -------
         | limited    |system
         | syscalls   |calls
        ---------------
        | Host Kernel |
        ---------------
               |
               |hardware
```

### kata

Kata creates a sandbox environment for containers to interact with as proxy, not too dissimilar to gvisor but the main point of difference is that kata uses a VM to achieve this.<br/>

gVisor and katacontainers allow us to implement defense in depth when it comes to application containers and host system security.<br/>

## Capabilites and Syscalls

Let's talk about capabilities for a bit.

From [man 7 capabilities](https://manpages.debian.org/bookworm/manpages/capabilities.7.en.html):

```txt
For the purpose of performing permission checks, traditional UNIX implementations distinguish two
categories of processes: privileged processes (whose effective user ID is 0, referred to as
superuser or root), and unprivileged processes (whose effective UID is nonzero).  Privileged
processes bypass all kernel permission checks, while unprivileged processes are subject to full
permission checking based on the process's credentials (usually: effective UID, effective GID, and
supplementary group list).

Starting with Linux 2.2, Linux divides the privileges traditionally associated with superuser into
distinct units, known as capabilities, which can be independently enabled and disabled.
Capabilities are a per-thread attribute.
```

Capabilities give you a more granular control over which privileges to give instead of just root and non-root.<br/>
Docker let's us choose which capabilities to give to a container. So we can for example allow a non-privileged process to bind to privileged ports using capabilities.<br/>
As an example, a simple application making calls to API endpoints and writing results back to a database does not require any capabilities. It can run under a non-privileged user with no capabilities and do all the tasks that it needs to do.
That being said, determining which capabilities are required can be a bit challenging when it comes to certain applications since there is no straightforward way of achieving this. In certain cases we can get away with dropping all capabilities, running our application and then trying to figure out, based on the received error messages, which capability is missing and needs to be given to the application. But in certain cases this may not be feasible or practical.

From [man 2 sycalls](https://manpages.debian.org/bookworm/manpages-dev/syscalls.2.en.html):

```txt
The system call is the fundamental interface between an application and the Linux kernel.
```

The Linux kernel lets us choose which ones of these interface calls can be allowed to be made by an application. We can essentially filter which syscalls are allowed and which ones are not on a per application basis. Docker enables this functionality with an arguably more friendly approach.<br/>
Capabilities and syscall filtering are tools to implement principle of least privilege. Ideally, we would like to allow a container to only have access to what it needs and just that. Not more, and obviously not less.<br/>

### capabilities in the wild

Capabilities are a Linux feature, docker allows us to use that with application containers. We'll look at a very simple example of how one can set capabilities for a regular executable on Linux.<br/>
[man 8 setcap](https://manpages.debian.org/bookworm/libcap2-bin/setcap.8.en.html) lets us set capabilities for a file.

### syscall Filtering in the wild

As an example we will look at [man 1 bwrap](https://manpages.debian.org/bookworm/bubblewrap/bwrap.1.en.html).
[Bubblewrap](https://github.com/containers/bubblewrap) allows us to sandbox an application, not too dissimilar to docker. Flatpaks use bubblewrap as part of their sandbox.<br/>
Bubblewrap can optionally take in a list of syscalls to [filter](https://www.kernel.org/doc/html/v4.19/userspace-api/seccomp_filter.html).<br/>
The filter is expressed as a BPF(Berkley Packet Filter program - remember when I said docker gives you a [friendlier](https://docs.docker.com/engine/security/seccomp/) interface to seccomp?) program.<br/>
Below is a short program that defines a BPF program that can be passed to an application using bwrap that lets us log all the sycalls the application makes to syslog.<br/>

```c
#include <fcntl.h>
#include <seccomp.h>
#include <stdbool.h>
#include <unistd.h>

void log_all_syscalls(void) {
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_LOG);
  seccomp_arch_add(ctx, SCMP_ARCH_X86_64);
  seccomp_export_bpf(ctx, 1);
  seccomp_export_pfc(ctx, 2);
  seccomp_release(ctx);
}

int main(int argc, char **argv) {
  log_all_syscalls();
}
```

Building is straightforward. Just remember to link against `libseccomp` with `-lseccomp`.<br/>

```bash
gcc main.c -lseccomp
```

Running the above code we get this:<br/>

```txt
 > 5@#
# pseudo filter code start
#
# filter for arch x86_64 (3221225534)
if ($arch == 3221225534)
  # default action
  action LOG;
# invalid architecture action
action KILL;
#
# pseudo filter code end
#
```

```bash
#!/usr/bin/dash

TEMP_LOG=/tmp/seccomp_logging_filter.bpf

./a.out > ${TEMP_LOG}

bwrap --seccomp 9 9<${TEMP_LOG} bash
```

Then we can go and see where the logs end up. On my host, they are logged under `/var/log/audit/audit.log` and they look like this:

```
type=SECCOMP msg=audit(1716144132.339:4036728): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036729): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036730): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036731): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036732): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036733): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=14 compat=0 ip=0x7fa5859664f4 code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigprocmask
type=SECCOMP msg=audit(1716144132.339:4036734): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=13 compat=0 ip=0x7fa58591298f code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=rt_sigaction
type=SECCOMP msg=audit(1716144132.339:4036735): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=1 compat=0 ip=0x7fa5859ce5d0 code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=write
type=SECCOMP msg=audit(1716144132.339:4036736): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=1 compat=0 ip=0x7fa5859ce5d0 code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=write
type=SECCOMP msg=audit(1716144132.339:4036737): auid=1000 uid=1000 gid=1000 ses=1 subj=unconfined pid=19633 comm="bash" exe="/usr/bin/bash" sig=0 arch=c000003e syscall=270 compat=0 ip=0x7fa5859d77bc code=0x7ffc0000AUID="devi" UID="devi" GID="devi" ARCH=x86_64 SYSCALL=pselect6
```

Docker allows us to do the [same](https://docs.docker.com/engine/security/seccomp/). We can give docker a seccomp profile to filter out the syscalls that are not required for a specific container.<br/>
You can find the default docker seccomp profile [here](https://github.com/moby/moby/blob/master/profiles/seccomp/default.json).<br/>

## Namespaces

```
A namespace wraps a global system resource in an abstraction that makes it appear to the processes
within the namespace that they have their own isolated instance of the global resource.  Changes
to the global resource are visible to other processes that are members of the namespace, but are
invisible to other processes.  One use of namespaces is to implement containers.
```

From [man 7 namespaces](https://manpages.debian.org/bookworm/manpages/namespaces.7.en.html).
You can think of namespaces as almost the same thing as a namespace does in some programming languages.<br/>
Docker uses its own namespaces for the containers so as to further isolate the application containers from the host system.<br/>

### Namespaces in the Wild

As an example let's look at the script provided below. Here we are creating a new network namespace. The new interface is provided by simply connecting an android phone for USB tethering. Depending on the situation you have going on and the `udev` naming rules the interface name will differ but the concept is the same. We are creating a new network namespace for a second internet provider, which in this case, is our android phone. We then use this network namespace to execute commands in the context of this specific network namespace. Essentially, we can choose which applications get to use our phone internet and which ones use whatever it is we were previously connected to.<br/>

```sh
#!/usr/bin/env sh
PHONE_NS=phone_ns
IF=enp0s20f0u6

sudo ip netns add ${PHONE_NS}
sudo ip link set ${IF} netns ${PHONE_NS}
sudo ip netns exec ${PHONE_NS} ip link set ${IF} up
sudo ip netns exec ${PHONE_NS} ip link set dev lo up
sudo ip netns exec ${PHONE_NS} dhclient ${IF}
```

```sh
$ sudo ip netns exec home_ns curl -4 icanhaveip.com
113.158.237.102
$ curl -4 icanhasip.com
114.201.132.98
```

**_HINT_**: The IP addresses are made up. The only thing that matters is that they are different.<br/>

Since we have the android phone's interface on another namespace the two cannot interfere with each other. This is pretty much how docker uses namespaces.<br/>
Without a network namespace we would have to make a small VM, run a VPN on the VM and then make a socks5 proxy to the VM from the host and then have applications pass their traffic through a socks5 proxy with varying degrees of success.<br/>
**_NOTE_**: since we are not running the script on a hook, you might blow out your net having two upstreams at the same time. In which case, run the script, then restart NetworkManager or whatever you have.

## SBOM and Provenance Attestation

What is SBOM?
NIST defines SBOM as a “formal record containing the details and supply chain relationships of various components used in building software.".<br/>
It contains details about the components used to create a certain piece of software.<br/>
SBOM is meant to help mitigate the threat of supply chain attacks(remember xz?).<br/>

What is provenance?

```
The provenance attestations include facts about the build process, including details such as:

    Build timestamps
    Build parameters and environment
    Version control metadata
    Source code details
    Materials (files, scripts) consumed during the build
```

[source](https://docs.docker.com/build/attestations/sbom/)

### Example

Let's review all that we learned about in the form of a light exercise.<br/>

For the first build, we use a non-vendored version.
Vendoring means that you store your dependencies locally. This means you are in control of your dependencies. You don't need to pull them from a remote. Even if one or more of your dependencies One of the more famous examples is Lua. The Lua foundation actually recommend vendoring your Lua dependency.<br/>
Vendoring helps with build reproducability.<br/>

We will use [milla](https://github.com/terminaldweller/milla) as an exmaple. It's a simple go codebase.

```Dockerfile
FROM alpine:3.19 as builder
RUN apk update && \
      apk upgrade && \
      apk add go git
WORKDIR /milla
COPY go.sum go.mod /milla/
RUN go mod download
COPY *.go /milla/
RUN go build

FROM alpine:3.19
ENV HOME /home/user
RUN set -eux; \
  adduser -u 1001 -D -h "$HOME" user; \
  mkdir "$HOME/.irssi"; \
  chown -R user:user "$HOME"
COPY --from=builder /milla/milla "$HOME/milla"
RUN chown user:user "$HOME/milla"
ENTRYPOINT ["home/user/milla"]
```

The first docker image build is fairly simple. We copy the source code in, get our dependencies and build a static executable. As for the second stage of the build, we simply put the executable into a new base image and we are done.<br/>

The second build which is a vendored build with a golang distroless base. We copy over the source code for the project and all its dependencies and then do the same as before.

```Dockerfile
FROM golang:1.21 as builder
WORKDIR /milla
COPY go.sum go.mod /milla/
RUN go mod download
COPY *.go /milla/
RUN CGO_ENABLED=0 go build

FROM gcr.io/distroless/static-debian12
COPY --from=builder /milla/milla "/usr/bin/milla"
ENTRYPOINT ["milla"]
```

Below You can see an example docker compose file. Milla can optionally use a postgres database to store messages. We also include a pgadmin instance. Now let's talk about the docker compose file.<br/>

```yaml
services:
  terra:
    image: milla_distroless_vendored
    build:
      context: .
      dockerfile: ./Dockerfile_distroless_vendored
    deploy:
      resources:
        limits:
          memory: 128M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    networks:
      - terranet
    user: 1000:1000
    restart: unless-stopped
    entrypoint: ["/usr/bin/milla"]
    command: ["--config", "/config.toml"]
    volumes:
      - ./config.toml:/config.toml
      - /etc/localtime:/etc/localtime:ro
    cap_drop:
      - ALL
    runtime: runsc
  postgres:
    image: postgres:16-alpine3.19
    deploy:
      resources:
        limits:
          memory: 4096M
    logging:
      driver: "json-file"
      options:
        max-size: "200m"
    restart: unless-stopped
    ports:
      - "127.0.0.1:5455:5432/tcp"
    volumes:
      - terra_postgres_vault:/var/lib/postgresql/data
      - ./scripts/:/docker-entrypoint-initdb.d/:ro
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/pg_pass_secret
      - POSTGRES_USER_FILE=/run/secrets/pg_user_secret
      - POSTGRES_INITDB_ARGS_FILE=/run/secrets/pg_initdb_args_secret
      - POSTGRES_DB_FILE=/run/secrets/pg_db_secret
    networks:
      - terranet
      - dbnet
    secrets:
      - pg_pass_secret
      - pg_user_secret
      - pg_initdb_args_secret
      - pg_db_secret
    runtime: runsc
  pgadmin:
    image: dpage/pgadmin4:8.6
    deploy:
      resources:
        limits:
          memory: 1024M
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
    environment:
      - PGADMIN_LISTEN_PORT=${PGADMIN_LISTEN_PORT:-5050}
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_DEFAULT_EMAIL:-devi@terminaldweller.com}
      - PGADMIN_DEFAULT_PASSWORD_FILE=/run/secrets/pgadmin_pass
      - PGADMIN_DISABLE_POSTFIX=${PGADMIN_DISABLE_POSTFIX:-YES}
    ports:
      - "127.0.0.1:5050:5050/tcp"
    restart: unless-stopped
    volumes:
      - terra_pgadmin_vault:/var/lib/pgadmin
    networks:
      - dbnet
    secrets:
      - pgadmin_pass
networks:
  terranet:
    driver: bridge
  dbnet:
volumes:
  terra_postgres_vault:
  terra_pgadmin_vault:
secrets:
  pg_pass_secret:
    file: ./pg/pg_pass_secret
  pg_user_secret:
    file: ./pg/pg_user_secret
  pg_initdb_args_secret:
    file: ./pg/pg_initdb_args_secret
  pg_db_secret:
    file: ./pg/pg_db_secret
  pgadmin_pass:
    file: ./pgadmin/pgadmin_pass
```

We are assigning memory usage limits for the containers. We are also limiting the size of the logs we are keeping on disk.<br/>
One thing that we did not talk about before is the networking side of compose.<br/>
As can be seen, the postgres and pgadmin container share one network while the postgres container and milla share another network. This makes it so that milla and pgadmin do not have access to each other. This is inline with principle of least privilege. Milla and pgadmin don't need to talk to each other so they can't do that.<br/>
Also we refrain from using host networking.<br/>
We are also binding the open ports to the host's localhost interface. This does not let us connect to the endpoints directly. In our example we don't need the ports to be exposed to the internet but we will need access to them. What we can do is bind the open ports to the host's localhost and then use ssh to forward the ports onto our own machine, assuming the docker host is a remote.<br/>

```sh
ssh -L 127.0.0.1:5460:127.0.0.1:5455 user@remotehost
```

While building milla, for the second stage of the build, we made a non-privileged user and our now mapping a non-privileged user on the host to that user. We are removing all capabilities from milla since milla will be making requests and has no server functionality. Milla will only need to bind to high-numbered ports which does not require a special privileges.<br/>
We run both postgres and milla with gvisor's runsc runtime since it's possible to do so.<br/>
Finally we use docker secrets to put the secrets into the container's runtime environment.<br/>

Now onto the attestations.<br/>
In order to view the SBOM for the image we will use docker [scout](https://docs.docker.com/scout/install/).<br/>

```sh
docker scout sbom milla
docker scout sbom milla_distroless_vendored
```

The SBOMs can be viewed [here](https://gist.github.com/terminaldweller/8e8ecdcb68d4052aecb6804823648b4d) and [here](https://gist.github.com/terminaldweller/f4ede7122f159506f8e6e6be2bfd6a8b) respectively.<br/>

Now lets look at the provenance attestations.

```sh
docker buildx imagetools inspect terminaldweller/milla:main --format "{{ json .Provenance.SLSA }}"
```

And [here](https://gist.github.com/terminaldweller/033ae07a9e685db85b18eb822dea4be3) you can look at the result.<br/>

## Further Reading

- [man 7 cgroups](https://manpages.debian.org/bookworm/manpages/cgroups.7.en.html)
- system containers using [lxc/incus](https://github.com/lxc/incus)
- [katacontainers](https://katacontainers.io/)
<p>
  <div class="timestamp">timestamp:1716163133</div>
  <div class="version">version:1.0.0</div>
  <div class="rsslink">https://blog.terminaldweller.com/rss/feed</div>
  <div class="originalurl">https://raw.githubusercontent.com/terminaldweller/blog/main/mds/securedocker.md</div>
</p>
