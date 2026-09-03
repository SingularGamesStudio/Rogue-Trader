;(() => {
  const basePath = location.hostname === "localhost" ? "" : "/Rogue-Trader"

  const styleId = "zoom-map-styles"

  if (!document.getElementById(styleId)) {
    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      .zoom-map {
        position: relative;
        width: 100%;
        min-height: 240px;
        overflow: hidden;
        background: #111;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .zoom-map.is-dragging {
        cursor: grabbing;
      }

      .zoom-map-scene {
        position: absolute;
        inset: 0 auto auto 0;
        width: 100%;
        transform-origin: top left;
        will-change: transform;
      }

      .zoom-map-image {
        display: block;
        width: 100%;
        height: auto;
        pointer-events: none;
      }

      .zoom-map-pin {
        position: absolute;
        z-index: 10;
        display: block;
        width: 24px;
        height: 24px;
        box-sizing: border-box;
        transform: translate(-50%, -100%) rotate(-45deg);
        border: 2px solid #fff;
        border-radius: 50% 50% 50% 0;
        background: #d63636;
        box-shadow: 0 2px 6px rgb(0 0 0 / 75%);
        cursor: pointer;
      }

      .zoom-map-pin-dot {
        position: absolute;
        inset: 5px;
        border-radius: 50%;
        background: #fff;
        pointer-events: none;
      }

      .zoom-map-tooltip {
        position: absolute;
        bottom: calc(100% + 14px);
        left: 50%;
        z-index: 11;
        width: max-content;
        max-width: 280px;
        padding: 6px 9px;
        transform: translateX(-50%) rotate(45deg);
        border-radius: 4px;
        background: rgb(20 20 24 / 94%);
        color: #fff;
        font-family: system-ui, sans-serif;
        font-size: 0.8rem;
        font-weight: normal;
        line-height: 1.25;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
      }

      .zoom-map-error {
        padding: 1rem;
        border: 1px solid #9f3030;
        color: #ff9f9f;
        white-space: pre-wrap;
      }
    `
    document.head.appendChild(style)
  }

  function isExternalUrl(value) {
    return /^(https?:)?\/\//i.test(value)
  }

  function assetUrl(value) {
  const path = String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")

  if (/^(https?:)?\/\//i.test(path)) {
    return path
  }

  const relative = path.replace(/^\/+/, "")

  // Quartz-normalized content assets in img/ are lowercase.
  // Do NOT lowercase generated Quartz paths such as static/contentIndex.json.
  const emittedPath = relative.startsWith("img/")
    ? relative.toLowerCase()
    : relative

  return `${basePath}/${emittedPath}`.replace(/\/+/g, "/")
}

  function quartzNoteUrl(value) {
    let link = String(value ?? "")
      .trim()
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim()

    if (!link) return null
    if (isExternalUrl(link)) return link

    const slug = link
      .replace(/\\/g, "/")
      .replace(/\.md$/i, "")
      .split("/")
      .map((part) =>
        part
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      )
      .filter(Boolean)
      .join("/")

    return `${basePath}/${slug}`.replace(/\/+/g, "/")
  }

  function readValue(text, key) {
    const match = String(text).match(
      new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "mi"),
    )

    return match?.[1]?.trim().replace(/^["']|["']$/g, "")
  }

  function readImagePath(text) {
    const image = readValue(text, "image")
    if (image) return image

    const match = String(text).match(
      /^\s*imageBases\s*:\s*[\r\n]+\s*-\s*path\s*:\s*(.+?)\s*$/mi,
    )

    return match?.[1]?.trim().replace(/^["']|["']$/g, "")
  }

  function makeMarker(marker) {
    const pin = document.createElement("a")
    pin.className = "zoom-map-pin"
    pin.style.left = `${Number(marker.x) * 100}%`
    pin.style.top = `${Number(marker.y) * 100}%`

    const href = quartzNoteUrl(marker.link)
    pin.href = href ?? "#"
    pin.setAttribute("aria-label", marker.tooltip || marker.link || "Map marker")

    if (!href) {
      pin.addEventListener("click", (event) => event.preventDefault())
    }

    const dot = document.createElement("span")
    dot.className = "zoom-map-pin-dot"
    pin.appendChild(dot)

    const text = String(marker.tooltip ?? "").trim()

    if (text) {
      const tooltip = document.createElement("span")
      tooltip.className = "zoom-map-tooltip"
      tooltip.textContent = text
      pin.appendChild(tooltip)

      const alwaysVisible = marker.tooltipAlwaysOn === true

      const setTooltipVisible = (visible) => {
        tooltip.style.opacity = visible ? "1" : "0"
      }

      setTooltipVisible(alwaysVisible)

      pin.addEventListener("mouseenter", () => setTooltipVisible(true))
      pin.addEventListener("mouseleave", () => setTooltipVisible(alwaysVisible))
      pin.addEventListener("focus", () => setTooltipVisible(true))
      pin.addEventListener("blur", () => setTooltipVisible(alwaysVisible))
    }

    return pin
  }

  function enablePanAndZoom(map, scene, minZoom, maxZoom) {
    let scale = 1
    let translateX = 0
    let translateY = 0
    let dragging = false
    let pointerStartX = 0
    let pointerStartY = 0
    let startTranslateX = 0
    let startTranslateY = 0

    const apply = () => {
      scene.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(${scale})`
    }

    map.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()

        const bounds = map.getBoundingClientRect()
        const mouseX = event.clientX - bounds.left
        const mouseY = event.clientY - bounds.top
        const multiplier = event.deltaY < 0 ? 1.15 : 1 / 1.15
        const nextScale = Math.min(
          maxZoom,
          Math.max(minZoom, scale * multiplier),
        )

        const ratio = nextScale / scale
        translateX = mouseX - (mouseX - translateX) * ratio
        translateY = mouseY - (mouseY - translateY) * ratio
        scale = nextScale
        apply()
      },
      { passive: false },
    )

    map.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".zoom-map-pin")) return

      dragging = true
      pointerStartX = event.clientX
      pointerStartY = event.clientY
      startTranslateX = translateX
      startTranslateY = translateY

      map.classList.add("is-dragging")
      map.setPointerCapture(event.pointerId)
    })

    map.addEventListener("pointermove", (event) => {
      if (!dragging) return

      translateX = startTranslateX + event.clientX - pointerStartX
      translateY = startTranslateY + event.clientY - pointerStartY
      apply()
    })

    const stopDragging = () => {
      dragging = false
      map.classList.remove("is-dragging")
    }

    map.addEventListener("pointerup", stopDragging)
    map.addEventListener("pointercancel", stopDragging)

    map.addEventListener("dblclick", (event) => {
      const bounds = map.getBoundingClientRect()
      const mouseX = event.clientX - bounds.left
      const mouseY = event.clientY - bounds.top
      const nextScale = Math.min(maxZoom, scale * 1.5)
      const ratio = nextScale / scale

      translateX = mouseX - (mouseX - translateX) * ratio
      translateY = mouseY - (mouseY - translateY) * ratio
      scale = nextScale
      apply()
    })

    apply()
  }

  async function renderMap(code, imagePath, markerPath) {
    const pre = code.closest("pre")
    if (!pre) return

    const source = code.textContent
    const height = readValue(source, "height") || "480px"
    const minZoom = Number.parseFloat(readValue(source, "minZoom") || "0.05")
    const maxZoom = Number.parseFloat(readValue(source, "maxZoom") || "8")

    const map = document.createElement("div")
    map.className = "zoom-map"
    map.style.height = height

    const scene = document.createElement("div")
    scene.className = "zoom-map-scene"
    map.appendChild(scene)

    try {
      const response = await fetch(assetUrl(markerPath))

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      const imagePathFromData =
        data.activeBase ??
        data.bases?.[0]?.path ??
        imagePath

      const image = document.createElement("img")
      image.className = "zoom-map-image"
      image.src = assetUrl(imagePathFromData)
      image.alt = ""
      image.draggable = false
      scene.appendChild(image)

      for (const marker of data.markers ?? []) {
        const x = Number(marker.x)
        const y = Number(marker.y)

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          console.warn("Zoom map: skipped marker with invalid coordinates", marker)
          continue
        }

        console.log("Zoom map: rendering marker", marker)

        scene.appendChild(makeMarker({
          ...marker,
          x,
          y,
        }))
      }

      image.addEventListener("load", () => {
        enablePanAndZoom(map, scene, minZoom, maxZoom)
      })

      image.addEventListener("error", () => {
        console.error("Zoom map image failed to load:", image.src)
      })

      pre.replaceWith(map)
    } catch (error) {
      console.error("Zoom map failed:", error)

      const message = document.createElement("div")
      message.className = "zoom-map-error"
      message.textContent =
        `Zoom map failed to load marker JSON:\n${assetUrl(markerPath)}`

      pre.replaceWith(message)
    }
  }

  function initializeZoomMaps() {
    document.querySelectorAll("pre code").forEach((code) => {
      if (code.dataset.zoomMapLoaded === "true") return

      const source = code.textContent
      const imagePath = readImagePath(source)
      const markerPath = readValue(source, "markers")

      if (!imagePath || !markerPath) return

      code.dataset.zoomMapLoaded = "true"
      renderMap(code, imagePath, markerPath)
    })
  }

  document.addEventListener("nav", initializeZoomMaps)
  initializeZoomMaps()
})()