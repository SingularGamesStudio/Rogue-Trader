;(() => {
  const basePath = location.hostname === "localhost" ? "" : "/Rogue-Trader"

  const styleId = "zoom-map-styles"

  function ensureZoomMapStyles() {
    if (document.getElementById(styleId)) {
      return
    }

    const style = document.createElement("style")
    style.id = styleId

    // Tell Quartz SPA navigation not to remove this stylesheet.
    style.setAttribute("spa-preserve", "true")

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
        transform:
          translate(-50%, -100%)
          rotate(-45deg)
          scale(var(--zoom-map-pin-scale, 1));
        transform-origin: 50% 100%;
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
  ensureZoomMapStyles()

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
    const link = String(value ?? "")
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
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^\p{L}\p{N}'-]+/gu, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, ""),
      )
      .filter(Boolean)
      .join("/")

    if (!slug) {
      console.warn("Zoom map: cannot create a route from marker link:", link)
      return null
    }

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

    // pointerId -> { x, y }, in viewport/client coordinates.
    const pointers = new Map()

    let gestureMode = null // null | "pan" | "pinch"
    let panPointerId = null
    let panStartX = 0
    let panStartY = 0
    let panStartTranslateX = 0
    let panStartTranslateY = 0

    let pinchStartDistance = 0
    let pinchStartScale = 1
    let pinchStartCenterX = 0
    let pinchStartCenterY = 0
    let pinchStartTranslateX = 0
    let pinchStartTranslateY = 0

    // Prevent a marker link from opening after the user has actually dragged.
    let didMove = false
    let suppressClickUntil = 0

    const DRAG_THRESHOLD_PX = 6

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    const updateFitScale = () => {
      const mapWidth = map.clientWidth
      const sceneWidth = scene.offsetWidth

      if (mapWidth <= 0 || sceneWidth <= 0) {
        return false
      }

      fitScale = mapWidth / sceneWidth
      return true
    }

    const apply = () => {
      const effectiveScale = fitScale * scale

      scene.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(${effectiveScale})`

      // Scene scaling shrinks/grows every child. Inverse-scale pins so their
      // apparent size stays 24px regardless of image resolution or map zoom.
      scene.style.setProperty(
        "--zoom-map-pin-scale",
        String(1 / Math.max(effectiveScale, 0.0001)),
      )
    }

    const getMapPoint = (clientX, clientY) => {
      const bounds = map.getBoundingClientRect()

      return {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      }
    }

    const getTwoPointers = () => {
      const [first, second] = [...pointers.values()]
      return [first, second]
    }

    const getPinchGeometry = () => {
      const [a, b] = getTwoPointers()

      const center = {
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
      }

      return {
        center,
        distance: Math.hypot(b.x - a.x, b.y - a.y),
      }
    }

    const beginPan = () => {
      if (pointers.size !== 1) return

      const [pointerId, point] = [...pointers.entries()][0]

      gestureMode = "pan"
      panPointerId = pointerId
      panStartX = point.x
      panStartY = point.y
      panStartTranslateX = translateX
      panStartTranslateY = translateY
    }

    const beginPinch = () => {
      if (pointers.size < 2) return

      const { center, distance } = getPinchGeometry()

      gestureMode = "pinch"
      pinchStartDistance = Math.max(distance, 1)
      pinchStartScale = scale
      pinchStartCenterX = center.x
      pinchStartCenterY = center.y
      pinchStartTranslateX = translateX
      pinchStartTranslateY = translateY
    }

    const zoomAt = (mapX, mapY, nextScale) => {
      const clampedScale = clamp(nextScale, minZoom, maxZoom)
      const ratio = clampedScale / scale

      translateX = mapX - (mapX - translateX) * ratio
      translateY = mapY - (mapY - translateY) * ratio
      scale = clampedScale
    }

    map.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()

        const point = getMapPoint(event.clientX, event.clientY)
        const multiplier = event.deltaY < 0 ? 1.15 : 1 / 1.15

        zoomAt(point.x, point.y, scale * multiplier)
        apply()
      },
      { passive: false },
    )

    map.addEventListener("pointerdown", (event) => {
      // Preserve ordinary marker taps/clicks. A drag beginning on blank map
      // space controls the camera.
      if (event.target.closest(".zoom-map-pin")) return

      const point = getMapPoint(event.clientX, event.clientY)
      pointers.set(event.pointerId, point)

      didMove = false

      // Capture means the map continues receiving moves/up events even if a
      // finger leaves the visible map bounds.
      map.setPointerCapture(event.pointerId)

      if (pointers.size === 1) {
        beginPan()
        map.classList.add("is-dragging")
      } else if (pointers.size === 2) {
        beginPinch()
        map.classList.add("is-dragging")
      }
    })

    map.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return

      const point = getMapPoint(event.clientX, event.clientY)
      pointers.set(event.pointerId, point)

      if (gestureMode === "pan" && event.pointerId === panPointerId) {
        const dx = point.x - panStartX
        const dy = point.y - panStartY

        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          didMove = true
        }

        translateX = panStartTranslateX + dx
        translateY = panStartTranslateY + dy
        apply()
        return
      }

      if (gestureMode === "pinch" && pointers.size >= 2) {
        const { center, distance } = getPinchGeometry()

        const nextScale = clamp(
          pinchStartScale * (distance / pinchStartDistance),
          minZoom,
          maxZoom,
        )

        // The midpoint both pans the map and provides the zoom focal point.
        // This keeps the content below the fingers visually stable.
        const ratio = nextScale / pinchStartScale

        translateX =
          center.x -
          (pinchStartCenterX - pinchStartTranslateX) * ratio

        translateY =
          center.y -
          (pinchStartCenterY - pinchStartTranslateY) * ratio

        scale = nextScale

        if (
          Math.hypot(
            center.x - pinchStartCenterX,
            center.y - pinchStartCenterY,
          ) >= DRAG_THRESHOLD_PX ||
          Math.abs(distance - pinchStartDistance) >= DRAG_THRESHOLD_PX
        ) {
          didMove = true
        }

        apply()
      }
    })

    const stopPointer = (event) => {
      if (!pointers.has(event.pointerId)) return

      pointers.delete(event.pointerId)

      if (map.hasPointerCapture?.(event.pointerId)) {
        map.releasePointerCapture(event.pointerId)
      }

      if (didMove) {
        suppressClickUntil = performance.now() + 250
      }

      if (pointers.size === 1) {
        // After lifting one finger from a pinch, continue naturally as a
        // single-finger pan from the remaining finger's current position.
        beginPan()
        return
      }

      if (pointers.size === 0) {
        gestureMode = null
        panPointerId = null
        map.classList.remove("is-dragging")
      }
    }

    map.addEventListener("pointerup", stopPointer)
    map.addEventListener("pointercancel", stopPointer)
    map.addEventListener("lostpointercapture", stopPointer)

    map.addEventListener(
      "click",
      (event) => {
        if (performance.now() < suppressClickUntil) {
          event.preventDefault()
          event.stopPropagation()
        }
      },
      true,
    )

    map.addEventListener("dblclick", (event) => {
      const point = getMapPoint(event.clientX, event.clientY)

      zoomAt(point.x, point.y, scale * 1.5)
      apply()
    })

    if (!updateFitScale()) {
      console.error("Zoom map: invalid initial dimensions", {
        mapWidth: map.clientWidth,
        sceneWidth: scene.offsetWidth,
      })
      return
    }

    apply()
  }

  async function renderMap(code, imagePath, markerPath) {
    const pre = code.closest("pre")
    if (!pre) return

    if (pre.dataset.zoomMapLoaded === "true") return
    pre.dataset.zoomMapLoaded = "true"

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

    pre.replaceWith(map)

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
      image.alt = ""
      image.draggable = false

      image.addEventListener(
        "load",
        () => {
          // Native image coordinate space: marker percentages now refer to the
          // original image dimensions, not to the visible map width.
          scene.style.width = `${image.naturalWidth}px`
          scene.style.height = `${image.naturalHeight}px`

          let attempts = 0
          const maxAttempts = 60

          const startWhenMeasurable = () => {
            const mapWidth = map.clientWidth
            const mapHeight = map.clientHeight
            const sceneWidth = scene.offsetWidth
            const sceneHeight = scene.offsetHeight

            // Wait for Quartz/CSS/layout to produce actual dimensions.
            if (
              mapWidth <= 0 ||
              mapHeight <= 0 ||
              sceneWidth <= 0 ||
              sceneHeight <= 0
            ) {
              attempts += 1

              if (attempts < maxAttempts) {
                requestAnimationFrame(startWhenMeasurable)
              } else {
                console.error("Zoom map: map never acquired measurable dimensions", {
                  mapWidth,
                  mapHeight,
                  sceneWidth,
                  sceneHeight,
                  imageNaturalWidth: image.naturalWidth,
                  imageNaturalHeight: image.naturalHeight,
                })
              }

              return
            }

            enablePanAndZoom(map, scene, minZoom, maxZoom)
          }

          requestAnimationFrame(startWhenMeasurable)
        },
        { once: true },
      )

      image.addEventListener(
        "error",
        () => {
          console.error("Zoom map image failed to load:", image.src)
        },
        { once: true },
      )

      image.src = assetUrl(imagePathFromData)
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
    } catch (error) {
      console.error("Zoom map failed:", error)

      const message = document.createElement("div")
      message.className = "zoom-map-error"
      message.textContent =
        `Zoom map failed to load marker JSON:\n${assetUrl(markerPath)}`

      pre.dataset.zoomMapLoaded = "false"
      pre.replaceWith(message)
    }
  }

  function initializeZoomMaps() {
    ensureZoomMapStyles()
    document.querySelectorAll("pre code").forEach((code) => {
      if (code.dataset.zoomMapLoaded === "true") return

      const source = code.textContent
      const imagePath = readImagePath(source)
      const markerPath = readValue(source, "markers")

      if (!imagePath || !markerPath) return

      renderMap(code, imagePath, markerPath)
    })
  }

  function scheduleZoomMapInitialization() {
    initializeZoomMaps()

    requestAnimationFrame(() => {
      initializeZoomMaps()

      requestAnimationFrame(() => {
        initializeZoomMaps()
      })
    })
  }

  document.addEventListener("nav", scheduleZoomMapInitialization)
  document.addEventListener("render", scheduleZoomMapInitialization)

  scheduleZoomMapInitialization()
})()