<p align="center">
  <img src="https://i.imgur.com/FIGZdR3.png">
</p>

Current version: **4.0.0**

# About
This takes ESPN/ESPN+, FOX Sports, Paramount+, MSG+, NFL+, B1G+, NESN, Mountain West, FloSports, CBS Sports, or MLB.tv programming and transforms it into a "live TV" experience with virtual linear channels. It will discover what is on, and generate a schedule of channels that will give you M3U and XMLTV files that you can import into something like [Jellyfin](https://jellyfin.org) or [Channels](https://getchannels.com).

## Notes
* This was not made for pirating streams. This is made for using your own credentials and have a different presentation than the streaming apps currently provide.
* The Mouse might not like it and it could be taken down at any minute. Enjoy it while it lasts. ¯\\_(ツ)_/¯

# Using
The server exposes 4 main endpoints:

| Endpoint | Description |
|---|---|
| /channels.m3u | The channel list you'll import into your client |
| /xmltv.xml | The schedule that you'll import into your client |
| /linear-channels.m3u | The linear channel list you'll import into your client (only used when using `LINEAR_CHANNELS` variable) |
| /linear-xmltv.xml | The linear schedule that you'll import into your client (only used when using `LINEAR_CHANNELS` variable) |

# Running
The recommended way of running is to pull the image from [Docker Hub](https://hub.docker.com/r/m0ngr31/eplustv).

## Environment Variables
| Environment Variable | Description | Required? | Default |
|---|---|---|---|
| START_CHANNEL | What the first channel number should be. | No | 1 |
| NUM_OF_CHANNELS | How many channels to create? This is dependent on the networks you are using. A good number to start with is >= 200 if you are using ESPN+. | No | 200 |
| LINEAR_CHANNELS | Break out dedicated linear channels (see Endpoints above to use) | No | False |
| BASE_URL | If using a reverse proxy, m3u will be generated with this uri base. | No | - |
| PROXY_SEGMENTS | Proxy keyed `*.ts` files. | No | False |
| PUID | Current user ID. Use if you have permission issues. Needs to be combined with PGID. | No | - |
| PGID | Current group ID. Use if you have permission issues. Needs to be combined with PUID. | No | - |
| PORT | Port the API will be served on. You can set this if it conflicts with another service in your environment. | No | 8000 |

### Available channel options

#### ESPN
Use if you would like to login with a TV provider or ESPN+ and access various ESPN events
| Environment Variable | Description | Default |
|---|---|---|
| ESPNPLUS | Set to false if you don't want to use ESPN+ | True |
| ESPN*** | ESPN: Set if your TV provider supports it | False |
| ESPN2*** | ESPN2: Set if your TV provider supports it | False |
| ESPN3 | ESPN2: Set if your TV provider supports it | False |
| ESPNU*** | ESPNU: Set if your TV provider supports it | False |
| SEC*** | SEC Network: Set if your TV provider supports it | False |
| SECPLUS | SEC Network+: Set if your TV provider supports it | False |
| ACCN*** | ACCN: Set if your TV provider supports it | False |
| ACCNX | ACCNX: Set if your TV provider supports it | False |
| ESPNEWS*** | ESPNews: Set if your TV provider supports it | False |
| ESPN_PPV | PPV: Set if you have purchased PPV events | False |

#### FOX Sports
Enable in your browser by going to the admin panel of the container

#### Paramount+
Enable in your browser by going to the admin panel of the container

#### CBS Sports
Enable in your browser by going to the admin panel of the container

#### NFL+
Use if you would like to login with NFL+.

Please note that if you only have an NFL account, you can still get events from Amazon Prime, Peacock, or your TV Provider.

*** If you have access to NFL RedZone (NFL+ Premium), it will be scheduled. If `LINEAR_CHANNELS` is set, it will be on its own channel

| Environment Variable | Description | Required? | Default |
|---|---|---|---|
| NFLPLUS | Set if you would like NFL+ events | False | False |
| NFL_TVE | Set if you would like NFL games from your TV Provider (not needed with NFL+) | False | False |
| NFL_PRIME | Set if you would like NFL games from Amazon Prime (not needed with NFL+) | False | False |
| NFL_PEACOCK | Set if you would like NFL games from Peacock (not needed with NFL+) | False | False |
| NFL_SUNDAY_TICKET | Set if you would like NFL games from Sunday Ticket | False | False |
| NFLNETWORK* | Set if you would like the NFL Network channel (only available with `LINEAR_CHANNELS`). Must have NFL+ or TV Provider. | False | False |
| NFLCHANNEL* | Set if you would like the NFL Channel (only available with `LINEAR_CHANNELS`) | False | False |

#### NESN
Enable in your browser by going to the admin panel of the container

#### B1G+
Enable in your browser by going to the admin panel of the container

#### MSG+
Use if you would like to login with your MSG+ account
| Environment Variable | Description | Default |
|---|---|---|
| MSGPLUS*** | Set if you would like to use MSG+ | False |
| MSGPLUS_USER | MSG+ Username | False |
| MSGPLUS_PASS | MSG+ Password | False |

#### FloSports
Enable in your browser by going to the admin panel of the container

#### Mountain West
Enable in your browser by going to the admin panel of the container

#### MLB.tv
Enable in your browser by going to the admin panel of the container

*** If `LINEAR_CHANNELS` is set, Big Inning will be on its own channel

### Notes
`*`: Dedicated linear channel - Will only schedule when `LINEAR_CHANNELS` is set

`**`: Some events are on linear channels and some aren't. If you use `LINEAR_CHANNELS`, only events that are on FOX will be scheduled normally. All other events will be scheduled to linear channels

`***`: Will create a dedicated linear channel(s) if requested, if not, will schedule events normally

## Volumes
| Volume Name | Description | Required? |
|---|---|---|
| /app/config | Used to store DB and application state | Yes |


## Docker Run
By default, the easiest way to get running is:

```bash
docker run -p 8000:8000 -v config_dir:/app/config m0ngr31/eplustv
```

If you run into permissions issues:

```bash
docker run -p 8000:8000 -v config_dir:/app/config -e PUID=$(id -u $USER) -e PGID=$(id -g $USER) m0ngr31/eplustv
```

Once it runs for the first time, check the Docker logs to see what the next steps for authentication are.
