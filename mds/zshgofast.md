# How to make the zsh prompt faster

In this post, we are going to take a look at 3 ways of making the zsh prompt return faster.<br/>
We will talk about:

- plugin compilation
- caching
- async segments

There are obviously other methods, of course, but you can find them on almost any other blog talking about zsh prompts so for the sake of brevity, I'm not going to repeat them(an example: use [fnm](https://github.com/Schniz/fnm) instead of [nvm](https://github.com/nvm-sh/nvm) or why would you not use [mise](https://github.com/jdx/mise)). There is also a faster syntax highlighter for zsh.

- Using the color red for all segments in your zsh prompt will make it go faster because, as everyone should know by now, "red ones go faster"
- We acknowledge that using a faster plugin manager will make zsh go faster

Before we start though, a bit of reasoning on why I would be doing the things the way I am doing them. A prompt written entirely in a faster language will be faster, yes, but I'm not willing to write a couple of thousand lines of code to get my current shell prompt(the major issue here being maintenance throughout the years,i.e. technical debt). My shell prompt is pretty critical for me so I want to be in complete control over it which means I am unwilling to use ready-made prompts with thousands of lines of code which don't have half the segments that I need.

And finally:

```txt
If you say you care about your zsh prompt's performance then that means that you already have `zmodload zsh/zprof` in your rc file
```

You do have that in your rc file, right?
Right?
You are not one of those people who talk about performance without having any benchmarks, right?

## Plugin Compilation

zsh can compile zsh scripts into bytecode. This will have the effect of having a faster startup time(as in the script will not faster) for the first time when you run that script but for the subsequent invocations. Also, after the script is loaded and is running, this will not affect the execution time performance so this will only make the startup of the said plugins faster.
The way we use this to get a faster prompt is to explicitly ask zsh to compile certain chunky plugins(think your [syntax highlighters](https://github.com/zsh-users/zsh-syntax-highlighting) and [completion](https://github.com/zsh-users/zsh-autosuggestions) plugins) into bytecode.

```zsh
zcompile-many ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions/{zsh-autosuggestions.zsh,src/**/*.zsh}
zcompile-many ~/zsh-async.git/v1.8.5/async.zsh
```

I would suggest to take a look at the sections related to `precompil`ing under `man 1 zshall` to make sure you are aware of some "gotcha"s.

## Eval Caching

Like the title says, this is about caching the results of `eval`s. This is a thing because some heavier/older version managers use this to inject themselves into your shell and some of them just take too much time.
For those kinds of plugins you can use [evalcache](https://github.com/mroth/evalcache/).
After sourcing the script, you can use it like so:

```zsh
_evalcache rbenv init -
```

Admittedly, this is very limited in scope and it has no smart way of redoing the cache. A function is provided, namely `_evalcache_clear` which will clear the cache, which in turn will result in the cache being regenerated.

## Async Segments

This is probably the most important one. Again, no surprises here. We will use a zsh async library,[zsh-async](https://github.com/mafredri/zsh-async), to have some async segments in our zsh prompt.

Let's take this zsh function from my prompt:

```zsh
docker_compose_running_pwd() {
  cwd="$1"
  local list=$(docker compose ls --format json | jq '.[].ConfigFiles' | tr -d '"')
  array=("${(@f)$(echo ${list})}")
  for elem in "${array[@]}"; do
    if [[ "${cwd}" == $(dirname "${elem}") ]];then
      echo "\U1F7E6"
      return
    else
        ;
    fi
  done
}
```

This function prints a blue square whether there is a docker compose file running from the current path we are in and outputs nothing if we are not.<br/>
Under normal circumstances this does not require to be an async segment but as soon as you switch your docker context to a remote docker host, then you will start to feel the pain.<br/>

We first define a start function that registers an async worker with the library and then define a callback function that get's called when the async runner returns:

```zsh
_async_dcpr_start() {
  async_start_worker dcpr_info
  async_register_callback dcpr_info _async_dcpr_info_done
}
```

The start function has nothing special in it. We just register an async worker and then register a callback function that will be called when the runner returns. Please do not that `async_register_callback` will require two arguments, the name of the async runner and the name of our callback function.<br/>
Next we will define our callback function:

```zsh
_async_dcpr_info_done() {
  #first part
  local job=$1
  local return_code=$2
  local stdout=$3
  local more=$6
  #second part
  if [[  $job == '[async]' ]]; then
    if [[ $return_code -eq 2 ]]; then
      _async_dcpr_start
      return
    fi
  fi
  #third part
  dcpr_info_msg=$stdout
  #fourth part
  [[ $more == 1 ]] || set-prompt && zle reset-prompt
}
```

The callback functions gets 6 arguments(copied from [here](https://github.com/mafredri/zsh-async/blob/main/README.md)):

- $1 job name, e.g. the function passed to async_job
- $2 return code
  - Returns -1 if return code is missing, this should never happen, if it does, you have likely run into a bug. Please open a new issue with a detailed description of what you were doing.
- $3 resulting (stdout) output from job execution
- $4 execution time, floating point e.g. 0.0076138973 seconds
- $5 resulting (stderr) error output from job execution
- $6 has next result in buffer (0 = buffer empty, 1 = yes)
  - This means another async job has completed and is pending in the buffer, it's very likely that your callback function will be called a second time (or more) in this execution. It's generally a good idea to e.g. delay prompt updates (zle reset-prompt) until the buffer is empty to prevent strange states in ZLE.

The function itself is straighforward. I like to rename the shell arguments so i have to deal with a name a couple of months from the timing of writing the function name and not some random numbers.<br/>

Next is the part where we handle the errors. These are the errors returned by the async runner. I like to call the start function of the async job again to get it to start again. This is not, generally speaking, a good idea since if something is broken and a rerun wont fix it, you end up running forever. This is essentially my version of having the async job "failing loudly".<br/>

The third part is where we assign the stdout that our function, `docker_compose_running_pwd`, made to a "global" variable. This variable,`dcpr_info_msg`, is the variable that we will use in our prompt.<br/>

The fourth part is the most important part. The first condition checks for an empty buffer. If the buffer is not empty, it means we have more async jobs that are still running, in which case it will not update the prompt. If, however the prompt buffer is empty, then we will `set` and `reset` the prompt to get an updated prompt displayed when all the async job returns. This explanation is true because I do this for all the async jobs that I run for my zsh prompt.<br/>
If you do this for all your async functions/segments(assuming all your async segments have their function), then the result would be that we only reset the prompt once, after the last async task finishes. This has the benefit of not redrawing the prompt on every async function return. This may or may not be what you want but doing it like this has some benefits: we won't end up with multiples redraws which might turn into a flicker on every new prompt. We don't end up running everything in the prompt everytime an async job returns.<br/>

In the next section, we simply call the init function of the library and then call our own start function after that:

```zsh
async_init
_async_dcpr_start
```

In this section we add our async job to the precmd hook for zsh so that our async job runs on the precmd hook on every prompt. The `precmd` hook is executed before the prompt is displayed.<br/>
Also please do note that this is where we actually tell the async runner what function to actually run. Moreover, this is where we pass any arguments that may or may not be needed to said function.<br/>
Do keep in mind that the async execution environment our function will run in is not the same as the one your shell prompt will be run in. This means that env vars will not carry over. In our example our docker compose function cannot get the current working directory by just accessing the `$PWD` env var so we will have to pass `$PWD` to it as a function argument manually.<br/>

```zsh
add-zsh-hook precmd (){
  async_job dcpr_info docker_compose_running_pwd $PWD
}
```

This final part serves two purposes. First, it clears the prompt var on changing a directory, so that we don't get a wrong result until we get a new result on a new prompt. Second, this also serves as the definition for our global var that we will use in the prompt.<br/>

```zsh
add-zsh-hook chpwd() {
  dcpr_info_msg=
}
```

Here's everything put together:

```zsh
docker_compose_running_pwd() {
  cwd="$1"
  local list=$(docker compose ls --format json | jq '.[].ConfigFiles' | tr -d '"')
  array=("${(@f)$(echo ${list})}")
  for elem in "${array[@]}"; do
    if [[ "${cwd}" == $(dirname "${elem}") ]];then
      echo "\U1F7E6"
      return
    else
        ;
    fi
  done
}

_async_dcpr_start() {
  async_start_worker dcpr_info
  async_register_callback dcpr_info _async_dcpr_info_done
}

_async_dcpr_info_done() {
  #first part
  local job=$1
  local return_code=$2
  local stdout=$3
  local more=$6
  #second part
  if [[  $job == '[async]' ]]; then
    if [[ $return_code -eq 2 ]]; then
      _async_dcpr_start
      return
    fi
  fi
  #third part
  dcpr_info_msg=$stdout
  #fourth part
  [[ $more == 1 ]] || set-prompt && zle reset-prompt
}

async_init
_async_dcpr_start

add-zsh-hook precmd (){
  async_job dcpr_info docker_compose_running_pwd $PWD
}

add-zsh-hook chpwd (){
  dcpr_info_msg=
}
```
