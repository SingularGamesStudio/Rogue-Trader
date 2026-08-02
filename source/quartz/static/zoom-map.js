;(() => {
  const basePath = location.hostname === "localhost" ? "" : "/Rogue-Trader"

  const css = `
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
      top: 0;
      left: 0;
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
      z-index: 2;
      width: 22px;
      height: 22px;
      transform: translate(-50%, -100%) rotate(-45deg);
      border: 2px solid #fff;
      border-radius: 50% 50% 50% 0;
      background: #d63636;
      box-shadow: 0 2px 6px rgb(0 0 0 / 75%);
      cursor: pointer;
    }

    .zoom-map-pin::after {
      position: absolute;
      inset: 5px;
      border-radius: 50%;
      background: #fff;
      content: "";
    }

    .zoom-map-tooltip {
      position: absolute;
      bottom: calc(100% + 14px);
      left: 50%;
      z-index: 3;
      width: max-content;
      max-width: 280px;
      padding: 6px 9px;
      transform: translateX(-50%) rotate(45deg);
      border-radius: 4px;
      background: rgb(20 20 24 / 94%);
      color: white;
      font-family: system-ui, sans-serif;
      font-size: 0.8rem;
      font-weight: normal;
      line-height: 1.25;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
    }

    .zoom-map-pin:hover .zoom-map-tooltip,
    .zoom-map-tooltip.is-always-on {
      opacity: 1;
    }

    .zoom-map-error {
      padding: 1rem;
      border: 1px solid #9f3030;
      color: #ff9f9f;
      white-space: pre-wrap;
    }
  `

  if (!document.getElementById("zoom-map-styles")) {
    const style = document.createElement("style")
    style.id = "zoom-map-styles"
    style.textContent = css
    document.head.appendChild(style)
  }

  function assetUrl(path) {
  path = path.trim().replace(/^["']|["']$/g, "")

  if (/^(https?:)?\/\//.test(path)) {
    return path
  }

  const relativePath = path.replace(/^\/+/, "")

  const emittedPath = relativePath.endsWith(".markers.json")
    ? relativePath.toLowerCase()
    : relativePath

  return `${basePath}/${emittedPath}`.replace(/\/+/g, "/")
}

  let quartzPagesPromise = null

function quartzPages() {
  if (!quartzPagesPromise) {
    quartzPagesPromise = fetch(assetUrl("static/contentIndex.json"))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Cannot load content index: ${response.status}`)
        }

        return response.json()
      })
  }

  return quartzPagesPromise
}

async function resolveNoteUrl(link) {
  const requested = (link ?? "")
    .trim()
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .split("#")[0]
    .trim()

  if (!requested) return null
  if (/^(https?:)?\/\//.test(requested)) return requested

  const requestedLower = requested
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .toLowerCase()

  const pages = await quartzPages()

  for (const [slug, page] of Object.entries(pages)) {
    const title = String(page.title ?? "").toLowerCase()

    const aliases = (page.aliases ?? [])
      .map((alias) => String(alias).toLowerCase())

    const slugLower = slug.toLowerCase()
    const filename = slugLower.split("/").at(-1)

    if (
      title === requestedLower ||
      aliases.includes(requestedLower) ||
      slugLower === requestedLower ||
      filename === requestedLower
    ) {
      return assetUrl(slug)
    }
  }

  console.warn(`Zoom map: no Quartz page found for "${requested}"`)
  return null
}

  function noteUrl(link) {
    link = (link ?? "")
      .trim()
      .replace(/^\[\[/, "")
      .replace(/\]\]$/, "")
      .split("|")[0]
      .split("#")[0]
      .trim()

    if (!link) return null
    if (/^(https?:)?\/\//.test(link)) return link

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
    const match = text.match(
      new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "mi"),
    )

    return match?.[1]?.trim().replace(/^["']|["']$/g, "")
  }

  function readImagePath(text) {
    const directImage = readValue(text, "image")
    if (directImage) return directImage

    const match = text.match(
      /^\s*imageBases\s*:\s*[\r\n]+\s*-\s*path\s*:\s*(.+?)\s*$/mi,
    )

    return match?.[1]?.trim().replace(/^["']|["']$/g, "")
  }

  async function makeMarker(marker) {
    const pin = document.createElement("a")
    pin.className = "zoom-map-pin"
    pin.style.position = "absolute"
    pin.style.zIndex = "9999"
    pin.style.display = "block"
    pin.style.visibility = "visible"
    pin.style.opacity = "1"
    pin.style.width = "24px"
    pin.style.height = "24px"
    pin.style.boxSizing = "border-box"
    pin.style.border = "2px solid white"
    pin.style.borderRadius = "50% 50% 50% 0"
    pin.style.background = "#d63636"
    pin.style.boxShadow = "0 2px 6px rgb(0 0 0 / 75%)"
    pin.style.transform = "translate(-50%, -100%) rotate(-45deg)"
    pin.style.cursor = "pointer"

    pin.style.left = `${marker.x * 100}%`
    pin.style.top = `${marker.y * 100}%`

    const dot = document.createElement("span")
    dot.style.position = "absolute"
    dot.style.inset = "5px"
    dot.style.borderRadius = "50%"
    dot.style.background = "white"
    dot.style.pointerEvents = "none"
    pin.appendChild(dot)

    const href = await resolveNoteUrl(marker.link)

    if (href) {
      pin.href = href
    } else {
      pin.addEventListener("click", (event) => event.preventDefault())
    }

    if (marker.tooltip?.trim()) {
      const tooltip = document.createElement("span")

      tooltip.className = "zoom-map-tooltip"
      tooltip.textContent = marker.tooltip.trim()

      tooltip.style.position = "absolute"
      tooltip.style.bottom = "calc(100% + 14px)"
      tooltip.style.left = "50%"
      tooltip.style.zIndex = "10000"
      tooltip.style.width = "max-content"
      tooltip.style.maxWidth = "280px"
      tooltip.style.padding = "6px 9px"
      tooltip.style.transform = "translateX(-50%) rotate(45deg)"
      tooltip.style.borderRadius = "4px"
      tooltip.style.background = "rgb(20 20 24 / 94%)"
      tooltip.style.color = "white"
      tooltip.style.fontFamily = "system-ui, sans-serif"
      tooltip.style.fontSize = "0.8rem"
      tooltip.style.fontWeight = "normal"
      tooltip.style.lineHeight = "1.25"
      tooltip.style.pointerEvents = "none"
      tooltip.style.opacity = marker.tooltipAlwaysOn ? "1" : "0"

      pin.addEventListener("mouseenter", () => {
        tooltip.style.opacity = "1"
      })

      pin.addEventListener("mouseleave", () => {
        tooltip.style.opacity = marker.tooltipAlwaysOn ? "1" : "0"
      })

      pin.appendChild(tooltip)
    }

    return pin
  }

  function enablePanAndZoom(map, scene, minZoom, maxZoom) {
    let scale = 1
    let x = 0
    let y = 0
    let dragging = false
    let startX = 0
    let startY = 0
    let initialX = 0
    let initialY = 0

    function applyTransform() {
      scene.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }

    map.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()

        const rect = map.getBoundingClientRect()
        const pointerX = event.clientX - rect.left
        const pointerY = event.clientY - rect.top

        const zoomFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15
        const nextScale = Math.min(maxZoom, Math.max(minZoom, scale * zoomFactor))
        const factor = nextScale / scale

        x = pointerX - (pointerX - x) * factor
        y = pointerY - (pointerY - y) * factor
        scale = nextScale

        applyTransform()
      },
      { passive: false },
    )

    map.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".zoom-map-pin")) return

      dragging = true
      startX = event.clientX
      startY = event.clientY
      initialX = x
      initialY = y

      map.classList.add("is-dragging")
      map.setPointerCapture(event.pointerId)
    })

    map.addEventListener("pointermove", (event) => {
      if (!dragging) return

      x = initialX + event.clientX - startX
      y = initialY + event.clientY - startY
      applyTransform()
    })

    function stopDragging() {
      dragging = false
      map.classList.remove("is-dragging")
    }

    map.addEventListener("pointerup", stopDragging)
    map.addEventListener("pointercancel", stopDragging)

    map.addEventListener("dblclick", (event) => {
      const rect = map.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      const nextScale = Math.min(maxZoom, scale * 1.5)
      const factor = nextScale / scale

      x = pointerX - (pointerX - x) * factor
      y = pointerY - (pointerY - y) * factor
      scale = nextScale

      applyTransform()
    })

    applyTransform()
  }

  async function renderMap(code, imagePath, markerPath) {
    const pre = code.closest("pre")
    if (!pre) return

    const source = code.textContent
    const height = readValue(source, "height") ?? "480px"
    const minZoom = Number.parseFloat(readValue(source, "minZoom") ?? "0.05")
    const maxZoom = Number.parseFloat(readValue(source, "maxZoom") ?? "8")

    const map = document.createElement("div")
    map.className = "zoom-map"
    map.style.height = height

    const scene = document.createElement("div")
    scene.className = "zoom-map-scene"
    map.appendChild(scene)

    try {
      const response = await fetch(assetUrl(markerPath))

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${assetUrl(markerPath)}`)
      }

      const data = await response.json()

      const visibleLayers = new Set(
        (data.layers ?? [])
          .filter((layer) => layer.visible !== false)
          .map((layer) => layer.id),
      )

      const actualImage =
        data.activeBase ??
        data.bases?.[0]?.path ??
        imagePath

      const image = document.createElement("img")
      image.className = "zoom-map-image"
      image.src = assetUrl(actualImage)
      image.alt = ""
      image.draggable = false
      scene.appendChild(image)

      for (const marker of data.markers ?? []) {
        if (marker.type !== "pin") continue
        if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) continue
        if (visibleLayers.size && !visibleLayers.has(marker.layer)) continue

        scene.appendChild(await makeMarker(marker))
      }

      image.addEventListener("load", () => {
        enablePanAndZoom(map, scene, minZoom, maxZoom)
      })

      pre.replaceWith(map)
    } catch (error) {
      console.error("Zoom map failed:", error)

      const message = document.createElement("div")
      message.className = "zoom-map-error"
      message.textContent =
        `Zoom map failed to load JSON:\n${assetUrl(markerPath)}`

      pre.replaceWith(message)
    }
  }

  function initializeZoomMaps() {
    for (const code of document.querySelectorAll("pre code")) {
      if (code.dataset.zoomMapLoaded === "true") continue

      const source = code.textContent
      const imagePath = readImagePath(source)
      const markerPath = readValue(source, "markers")

      if (!imagePath || !markerPath) continue

      code.dataset.zoomMapLoaded = "true"
      renderMap(code, imagePath, markerPath)
    }
  }

  document.addEventListener("nav", () => {
  for (const pin of document.querySelectorAll(".zoom-map-pin")) {
    pin.style.cssText += `
      position: absolute !important;
      z-index: 9999 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 28px !important;
      height: 28px !important;
      background: red !important;
      border: 3px solid white !important;
    `
  }
})

  document.addEventListener("nav", initializeZoomMaps)
  initializeZoomMaps()
})()