<p align="center">
  <img src="https://i.imgur.com/FIGZdR3.png">
</p>

Current version: **4.0.1**

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

### Available Providers

#### ESPN+

Available to login with ESPN+ credentials

##### Extras
| Name | Description |
|---|---|
| ESPN+ PPV | Schedule ESPN+ PPV events |

#### ESPN

Available to login with TV Provider

##### Linear Channels

Will create dedicated linear channels if using `LINEAR_CHANNELS`, otherwise will schedule events normally

| Network Name | Description |
|---|---|
| ESPN | Set if your TV provider supports it |
| ESPN2 | Set if your TV provider supports it |
| ESPNU | Set if your TV provider supports it |
| SEC Network | Set if your TV provider supports it |
| ACC Network | Set if your TV provider supports it |
| ESPNews | Set if your TV provider supports it |

##### Digital Networks

| Network Name | Description |
|---|---|
| ESPN3 | Set if your TV provider supports it |
| SEC Network+ | Set if your TV provider supports it |
| ACC Network Extra | Set if your TV provider supports it |

#### FOX Sports

Available to login with TV Provider

##### Linear Channels

Some events are on linear channels and some aren't. If you use `LINEAR_CHANNELS`, only events that are on FOX will be scheduled normally. All other events will be scheduled to linear channels

| Network Name |
|---|
| FS1 |
| FS2 |
| B1G Network |
| FOX Soccer Plus |

#### Paramount+

Available to login with Paramount+ credentials

##### Linear Channels

Dedicated linear channels - Will only schedule when `LINEAR_CHANNELS` is set

| Network Name | Description |
|---|---|
| CBS Sports HQ | Set if your TV provider supports it |
| Golazo Network | Set if your TV provider supports it |

#### CBS Sports

Available to login with TV Provider

#### NFL

Available to login with NFL.com credentials

This integration works with NFL+ or using other providers (TVE, Amazon Prime, Peacock, Sunday Ticket) to access games.

##### Extra Providers

If you don't have an NFL+ subscription, you can use these providers to access games.

| Provider Name | Description |
|---|---|
| Amazon Prime | Get TNF games from Amazon Prime |
| Peacock | Get SNF games from Peacock |
| TV Provider | Get in-market games from your TV Provider |
| Sunday Ticket | Get out-of-market games from Youtube |

##### Linear Channels

If you have access to NFL RedZone, it will be scheduled. If `LINEAR_CHANNELS` is set, it will be on its own channel

| Network Name | Description |
|---|---|
| NFL NETWORK | NFL+ or TV Provider access |
| NFL RedZone | NFL+ Premium or TV Provider access |
| NFL CHANNEL | Free channel for all accounts |

#### NESN

Available to login with NESN+ or TV Provider

##### Linear Channels

Will create dedicated linear channels if using `LINEAR_CHANNELS`, otherwise will schedule events normally

| Network Name | Description |
|---|---|
| NESN | New England Sports Network HD |
| NESN+ | New England Sports Network Plus HD |

#### B1G+

Available to login with B1G+ credentials

#### FloSports

Available to login with FloSports credentials

#### Mountain West

Available for free

#### MLB.tv

Available to login with MLB.tv credentials

##### Extras
| Name | Description |
|---|---|
| Only free games | If you have a free account, only 1 free game per day will be scheduled |

##### Linear Channels

Will create a dedicated linear channel if using `LINEAR_CHANNELS`, otherwise will schedule Big Inning normally

| Network Name |
|---|
| Big Inning |

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

Open the service in your web browser at `http://<ip>:8000`
