    document.getElementById("fetchButton").addEventListener("click", async () => {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        const instagramUrl = tab.url;

        console.log("Current tab URL:", instagramUrl);

        const match = instagramUrl.match(
            /instagram\.com\/(?:[^/]+\/)?p\/([^/?#]+)/i
        );

        if (!match) {
            throw new Error("Current tab is not an Instagram post");
        }

        const shortcode = match[1];

        console.log("Shortcode:", shortcode);

        // Get media ID from GraphQL
        const variables = JSON.stringify({
            shortcode: shortcode,
            __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
            __relay_internal__pv__PolarisMultiCaptionCarouselEnabledrelayprovider: true
        });

        const params = new URLSearchParams({
            variables: variables,
            doc_id: "27830990013244856"
        });

        const graphqlResponse = await fetch(
            "https://www.instagram.com/graphql/query/?" + params.toString(),
            {
                method: "GET",
                credentials: "include"
            }
        );

        if (!graphqlResponse.ok) {
            throw new Error(
                `GraphQL request failed: ${graphqlResponse.status}`
            );
        }

        const responseData = await graphqlResponse.json();

        const media =
            responseData.data
                ?.xdt_api__v1__media__shortcode__web_info
                ?.items?.[0];

        if (!media) {
            throw new Error("Instagram media not found");
        }

        const mediaId = media.pk;
        const caption = media.caption?.text;
        const username = media.user?.username || "instagram";

        console.log("Media ID:", mediaId);
        console.log("Username:", username);
        console.log("Caption:", caption);
        console.log("GraphQL media type:", media.media_type);

        // Get full media information
        const infoResponse = await fetch(
            `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
            {
                method: "GET",
                credentials: "include",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-IG-App-ID": "936619743392459"
                }
            }
        );

        if (!infoResponse.ok) {
            throw new Error(
                `Media info request failed: ${infoResponse.status}`
            );
        }

        const infoData = await infoResponse.json();

        console.log("Media info:", infoData);

        const infoMedia = infoData.items?.[0];

        if (!infoMedia) {
            throw new Error("Media information not found");
        }

        console.log("Media type:", infoMedia.media_type);

        let mediaUrl;
        let extension;

        // IMAGE
        if (infoMedia.media_type === 1) {
            const candidates =
                infoMedia.image_versions2?.candidates || [];

            if (candidates.length === 0) {
                throw new Error("No image versions found");
            }

            // Select highest resolution image
            const bestImage = candidates.reduce((best, current) => {
                return (
                    current.width * current.height >
                    best.width * best.height
                )
                    ? current
                    : best;
            });

            mediaUrl = bestImage.url;

            console.log("Best image URL:", mediaUrl);
            console.log(
                "Image resolution:",
                bestImage.width,
                "x",
                bestImage.height
            );

            extension =
                bestImage.type === "image/png"
                    ? "png"
                    : bestImage.type === "image/webp"
                    ? "webp"
                    : "jpg";
        }

        // VIDEO
        else if (infoMedia.media_type === 2) {
            const videoVersions =
                infoMedia.video_versions || [];

            if (videoVersions.length === 0) {
                throw new Error("No video versions found");
            }

            // Select highest resolution video
            const bestVideo = videoVersions.reduce((best, current) => {
                return (
                    current.width * current.height >
                    best.width * best.height
                )
                    ? current
                    : best;
            });

            mediaUrl = bestVideo.url;

            console.log("Best video URL:", mediaUrl);
            console.log(
                "Video resolution:",
                bestVideo.width,
                "x",
                bestVideo.height
            );

            extension = "mp4";
        } else if (infoMedia.media_type === 8) {
            const carouselMedia = infoMedia.carousel_media || [];

            if (carouselMedia.length === 0) {
                throw new Error("No carousel media found");
            }

            console.log("Carousel items:", carouselMedia.length);

            for (let i = 0; i < carouselMedia.length; i++) {
                const item = carouselMedia[i];

                let mediaUrl;
                let extension;

                console.log(
                    `Carousel item ${i + 1}:`,
                    "media type:",
                    item.media_type
                );

                // Carousel image
                if (item.media_type === 1) {
                    const candidates =
                        item.image_versions2?.candidates || [];

                    if (candidates.length === 0) {
                        console.error(
                            `No image versions found for carousel item ${i + 1}`
                        );
                        continue;
                    }

                    const bestImage = candidates.reduce((best, current) => {
                        return current.width * current.height >
                            best.width * best.height
                            ? current
                            : best;
                    });

                    mediaUrl = bestImage.url;
                    extension = "jpg";

                    console.log(
                        `Carousel item ${i + 1} image:`,
                        bestImage.width,
                        "x",
                        bestImage.height
                    );
                }

                // Carousel video
                else if (item.media_type === 2) {
                    const videoVersions =
                        item.video_versions || [];

                    if (videoVersions.length === 0) {
                        console.error(
                            `No video versions found for carousel item ${i + 1}`
                        );
                        continue;
                    }

                    const bestVideo = videoVersions.reduce((best, current) => {
                        return current.width * current.height >
                            best.width * best.height
                            ? current
                            : best;
                    });

                    mediaUrl = bestVideo.url;
                    extension = "mp4";

                    console.log(
                        `Carousel item ${i + 1} video:`,
                        bestVideo.width,
                        "x",
                        bestVideo.height
                    );
                }

                else {
                    console.warn(
                        `Unsupported carousel media type: ${item.media_type}`
                    );
                    continue;
                }

                if (!mediaUrl) {
                    continue;
                }

                chrome.downloads.download(
                    {
                        url: mediaUrl,
                        filename: `${username}_${i + 1}.${extension}`,
                        saveAs: false
                    },
                    (downloadId) => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                `Carousel item ${i + 1} download failed:`,
                                chrome.runtime.lastError.message
                            );
                            return;
                        }

                        console.log(
                            `Carousel item ${i + 1} download started:`,
                            downloadId
                        );
                    }
                );
            }
        }
        else {
            throw new Error(
                `Unsupported Instagram media type: ${infoMedia.media_type}`
            );
        }

        if (!mediaUrl) {
            throw new Error("No media URL found");
        }

        // Download media
        console.log("Downloading:", mediaUrl);

        chrome.downloads.download(
            {
                url: mediaUrl,
                filename: `${username}.${extension}`,
                saveAs: false
            },
            (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Download failed:",
                        chrome.runtime.lastError.message
                    );
                    return;
                }

                console.log("Download started:", downloadId);
            }
        );
    } catch (error) {
        console.error(
            "Fetch/download failed:",
            error
        );
    }
});

const TIKTOK_CLIENT_KEY = "sbaws75anrpfr1t3xo";

document.getElementById("loginButton").addEventListener("click", async () => {
    try {
        // Chrome generates:
        // https://<extension-id>.chromiumapp.org/
        const redirectUri = chrome.identity.getRedirectURL();

        console.log("TikTok redirect URI:", redirectUri);

        // CSRF protection
        const state = crypto.randomUUID();

        const params = new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY,
            response_type: "code",

            // Start with whatever scope you actually need.
            // For Content Posting API this will depend on the scopes
            // approved for your TikTok app.
            scope: "user.info.basic",

            redirect_uri: redirectUri,
            state: state
        });

        const authUrl =
            "https://www.tiktok.com/v2/auth/authorize/?" +
            params.toString();

        console.log("TikTok auth URL:", authUrl);

        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        });

        console.log("TikTok callback:", redirectUrl);

        if (!redirectUrl) {
            throw new Error("No redirect URL returned");
        }

        const callbackUrl = new URL(redirectUrl);

        // Check state
        const returnedState = callbackUrl.searchParams.get("state");

        if (returnedState !== state) {
            throw new Error("Invalid OAuth state");
        }

        // Check for OAuth error
        const error = callbackUrl.searchParams.get("error");

        if (error) {
            const errorDescription =
                callbackUrl.searchParams.get("error_description");

            throw new Error(
                `TikTok OAuth error: ${error}` +
                (errorDescription
                    ? ` - ${errorDescription}`
                    : "")
            );
        }

        // Authorization code
        const code = callbackUrl.searchParams.get("code");

        if (!code) {
            throw new Error("No authorization code returned by TikTok");
        }

        console.log("TikTok authorization code:", code);

        // IMPORTANT:
        // Do NOT exchange the code with TikTok directly from the extension
        // if that requires your client secret.
        //
        // Send the code to your backend instead.
        const result = await chrome.runtime.sendMessage({
            type: "exchangeTikTokCode",
            code: code,
            redirectUri: redirectUri
        });

        if (!result?.success) {
            throw new Error(
                result?.error || "TikTok token exchange failed"
            );
        }

        console.log("TikTok token response:", result.data);

    } catch (error) {
        console.error("TikTok login failed:", error);
    }
});


