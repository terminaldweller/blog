# Docker Containers, Linux Features and Security

OK. Let's take it from the top.<br/>

We will be exploring in which ways we can make an application container, more specifically a docker container, more secure.<br/>
We will not talk about firewalls and apparmor because they are tools that enhance security on the host in general and not specific to a docker application container. Be that as it may, it still means a secure host is always better than a non-secure host.<br/>
We will focus on Linux containers since Freebsd containers are still experimental(see [here](https://wiki.freebsd.org/Docker) and [here](https://github.com/samuelkarp/runj)). Yes, windows containers exist.<br/>

Before we begin, Linux docker containers are Linux. They are using most of the functionality that existed before application containers in the form of docker were a thing. Knowing Linux better means you know Linux Docker containers better. We will reference this fact a couple of time later on.<br/>

## Base Image

We start with the first building block of a new docker image, The base image. By far the most used base images are the Alpine docker base image, followed by Debian and Ubuntu docker base images.
These distros have two major differences that we want to focus on:

- C standard library implementation
- the userspace utility implementation

Debian and Ubuntu(we are not forgetting that Ubuntu itself is a Debian derivative) both use glibc, as in gnu's [libc](https://www.gnu.org/software/libc/) implementation. Alpine uses [musl-libc](https://www.musl-libc.org/) as its C standard library implementation.<br/>
The major difference here which will come into play later on again is glibc has been around for much longer, so it has to keep backwards compatibility for a much longer period of time and for far more many things. Also the general attitude with the glibc team is that they have to support everything since if they don't then who will?<br/>
Libmusl on the other hand, does not try to support everything under the sun, a relatively newer project comparatively, and, keep their codebase lean.<br/>
As a result not all applications are supported by libmusl but a good number of them are.<br/>
In simpler terms, libmusl has a far smaller attack surface compared to glic.<br/>

On to our second point, which is the cli utilities' implementation. Debian and Ubuntu use gnu's [Coreutils](https://www.gnu.org/software/coreutils/) while Alpine uses [Busybox](https://busybox.net/).<br/>
Here we have the same situation as before, The GNU coreutils are bigger, do more and have a larger attack surface. Busybox is smaller, does not support as many features as GNU Coreutils but do support enough of them to make them useful. Needless to say, busybox is small and lean hence it has a smaller attack surface.<br/>

For some intuitive observation, you can look at the some popular images that come in both Debian and Alpine flavours on dockerhub. Take a look at the number of reported vulnerabilities for both bases. The theme we observe is simple. The bigger the attack surface the bigger the number of vulnerabilities.<br/>

Alpine images are small, lean and functional, just like libmusl and busybox but there are still quite a few things on an alpine image that are extraneous. We can take them out and have a perfectly functioning application container.<br/>

That's how we get [distroless](https://github.com/GoogleContainerTools/distroless).<br/>
Distroless base images follow the same pattern as alpine base docker images, as in, less functionality while still keeping enough functionality to be able to do the job and minimizing the attack surface.
Minimizing a base image like this means that the base images are very specialized so we have base images for golang, python, java and the like.<br/>

## Dokcer Runtimes

What is a docker runtime?

- runc
- nvidia
- gvisor

### gviros's runsc

## Capabilites and Syscalls

[man 7 capabilites](https://manpages.debian.org/bookworm/manpages/capabilities.7.en.html)
[man 2 sycalls](https://manpages.debian.org/bookworm/manpages-dev/syscalls.2.en.html)

### capabilities in the wild

[man 8 setcap](https://manpages.debian.org/bookworm/libcap2-bin/setcap.8.en.html)

### syscall Filtering in the wild

[Bubblewrap](https://github.com/containers/bubblewrap)

Let's see how we can

```c
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <seccomp.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// https://blog.mnus.de/2020/05/sandboxing-soldatserver-with-bubblewrap-and-seccomp/

void log_all_syscalls(void) {
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_LOG);
  seccomp_arch_add(ctx, SCMP_ARCH_X86_64);
  seccomp_export_bpf(ctx, 1);
  seccomp_export_pfc(ctx, 2);
  seccomp_release(ctx);
}

int log_current_seccomp(void) {
  int rc = -1;
  scmp_filter_ctx ctx;
  int filter_fd;

  ctx = seccomp_init(SCMP_ACT_KILL);
  if (ctx == NULL)
    goto out;

  filter_fd = open("/tmp/seccomp_filter.bpf",
                   O_CREAT | O_WRONLY | O_NOFOLLOW | O_TRUNC, S_IRWXU);
  if (filter_fd == -1) {
    rc = -errno;
    goto out;
  }

  rc = seccomp_export_bpf(ctx, filter_fd);
  if (rc < 0) {
    close(filter_fd);
    goto out;
  }
  close(filter_fd);

  filter_fd = open("/tmp/seccomp_filter.pfc",
                   O_CREAT | O_WRONLY | O_NOFOLLOW | O_TRUNC, S_IRWXU);
  if (filter_fd == -1) {
    rc = -errno;
    goto out;
  }

  rc = seccomp_export_pfc(ctx, filter_fd);
  if (rc < 0) {
    close(filter_fd);
    goto out;
  }
  close(filter_fd);

out:
  seccomp_release(ctx);
  return -rc;
}

int main(int argc, char **argv) {
  if (argc == 3) {
    if (!strcmp("--filter", argv[1])) {
      if (!strcmp("current", argv[2])) {
        log_current_seccomp();
      } else if (!strcmp("logging", argv[2])) {
        log_all_syscalls();
      } else {
      }
    }
  } else {
    printf("going with the default filter kind which is logging.\n");
    log_all_syscalls();
  }
}
```

```bash
gcc -lseccomp
```

### Namespaces in the Wild

```sh
#!/usr/bin/dash

NS=home_ns
IF=wlp0s20f3
PHY=phy0

sudo ip netns add ${NS} || true
sudo iw phy ${PHY} set netns "$(sudo ip netns exec home_ns sh -c 'sleep 1 >&- & echo "$!"')"
# sudo ip link set ${IF} netns ${NS}
sudo ip netns exec ${NS} ip link set ${IF} up
sudo ip netns exec ${NS} ip link set dev lo up
sudo ip netns exec ${NS} dhclient ${IF}

ip netns exec ${NS} ping -4 9.9.9.9
ip netns exec ${NS} ping -4 google.com
ip netns exec ${NS} curl -4 icanhazip.com
```

```sh
sudo ip netns exec home_ns curl -4 icanhaveip.com
```

### Docker syscall filtering

### BPF

## SBOM and Provenance Attestation

### Conclusion

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
    environment:
      - HTTPS_PROXY=http://172.17.0.1:8120
      - https_proxy=http://172.17.0.1:8120
      - HTTP_PROXY=http://172.17.0.1:8120
      - http_proxy=http://172.17.0.1:8120
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

## Further Reading

- [man 7 cgroups](https://manpages.debian.org/bookworm/manpages/cgroups.7.en.html)
- [man 7 namespaces](https://manpages.debian.org/bookworm/manpages/namespaces.7.en.html)
- system containers using [lxc/incus](https://github.com/lxc/incus)
- [katacontainers](https://katacontainers.io/)
