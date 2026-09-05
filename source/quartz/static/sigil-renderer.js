;(() => {
  const styleId = "sigil-styles"
  const SVG_NS = "http://www.w3.org/2000/svg"
  const VERTICES = [
    [50, 7],
    [91, 37],
    [75, 86],
    [25, 86],
    [9, 37],
  ]
  const CENTER = [50, 51]
  const SIGIL_RE = /\{\{sigil(?:\s+([^}]*?))?\}\}/gi

  function ensureStyles() {
    if (document.getElementById(styleId)) return

    const style = document.createElement("style")
    style.id = styleId
    style.setAttribute("spa-preserve", "true")
    style.textContent = `
      .sigil-preview {
        --sigil-stroke: currentColor;
        display: inline-block;
        width: 1.15em;
        height: 1.15em;
        margin: 0 0.07em;
        vertical-align: -0.19em;
        line-height: 1;
      }

      .sigil-preview.large {
        width: 1.7em;
        height: 1.7em;
        vertical-align: -0.33em;
      }

      .sigil-preview.dim {
        opacity: 0.55;
      }

      .sigil-preview.red {
        --sigil-stroke: #d63636;
      }

      .sigil-preview.gold {
        --sigil-stroke: #d6a436;
      }
    `
    document.head.appendChild(style)
  }

  function readIndices(value) {
    return new Set(
      [...String(value ?? "")]
        .filter((character) => character >= "0" && character <= "4")
        .map(Number),
    )
  }

  function readOptions(text) {
    const options = {
      e: "",
      r: "",
      c: false,
      className: "",
      label: "Pentagonal sigil",
    }

    const attributeRe =
      /([a-z]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+)))?/gi

    let match
    while ((match = attributeRe.exec(text ?? ""))) {
      const key = match[1].toLowerCase()
      const value = match[2] ?? match[3] ?? match[4] ?? ""

      if (key === "e") options.e = value
      else if (key === "r") options.r = value
      else if (key === "c") options.c = true
      else if (key === "class") options.className = value
      else if (key === "label") options.label = value
    }

    return options
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name)

    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value))
    }

    return element
  }

  function paint(shape) {
    shape.style.setProperty("fill", "none", "important")
    shape.style.setProperty("stroke", "var(--sigil-stroke)", "important")
    shape.style.setProperty("stroke-width", "6", "important")
    shape.style.setProperty("stroke-linecap", "round", "important")
    shape.style.setProperty("stroke-linejoin", "round", "important")
    return shape
  }

  function renderSigil(options) {
    const host = document.createElement("span")
    host.className = `sigil-preview ${options.className}`.trim()
    host.setAttribute("role", "img")
    host.setAttribute("aria-label", options.label)

    const svg = svgElement("svg", {
      viewBox: "0 0 100 100",
      width: "100",
      height: "100",
      "aria-hidden": "true",
      focusable: "false",
    })

    svg.style.setProperty("display", "block", "important")
    svg.style.setProperty("width", "100%", "important")
    svg.style.setProperty("height", "100%", "important")

    for (const index of [...readIndices(options.e)].sort((a, b) => a - b)) {
      const [x1, y1] = VERTICES[index]
      const [x2, y2] = VERTICES[(index + 1) % VERTICES.length]
      svg.appendChild(paint(svgElement("line", { x1, y1, x2, y2 })))
    }

    for (const index of [...readIndices(options.r)].sort((a, b) => a - b)) {
      const [x2, y2] = VERTICES[index]
      svg.appendChild(
        paint(svgElement("line", {
          x1: CENTER[0],
          y1: CENTER[1],
          x2,
          y2,
        })),
      )
    }

    if (options.c) {
      svg.appendChild(
        paint(svgElement("circle", {
          cx: CENTER[0],
          cy: CENTER[1],
          r: "13",
        })),
      )
    }

    host.appendChild(svg)
    return host
  }

  function renderSigils(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes = []
    let node

    while ((node = walker.nextNode())) {
      const parent = node.parentElement

      if (
        !node.nodeValue.includes("{{sigil") ||
        parent?.closest("pre, code, script, style, textarea, a")
      ) {
        continue
      }

      textNodes.push(node)
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue
      SIGIL_RE.lastIndex = 0

      if (!SIGIL_RE.test(text)) continue
      SIGIL_RE.lastIndex = 0

      const fragment = document.createDocumentFragment()
      let lastIndex = 0
      let match

      while ((match = SIGIL_RE.exec(text))) {
        fragment.append(text.slice(lastIndex, match.index))
        fragment.append(renderSigil(readOptions(match[1])))
        lastIndex = match.index + match[0].length
      }

      fragment.append(text.slice(lastIndex))
      textNode.replaceWith(fragment)
    }
  }

  function initializeSigils() {
    ensureStyles()
    renderSigils(document.querySelector("article") ?? document.body)
  }

  document.addEventListener("nav", initializeSigils)
  document.addEventListener("render", initializeSigils)

  initializeSigils()
})()
