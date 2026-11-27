package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp

/**
 * The weather icons of the Vigie family, drawn from the SVG of the Home Assistant card (`FamilyIconData.kt`, written by
 * `tools/family_icons.py`): the same drawings as the card and the Meridien screen. A small reader of the subset they use:
 * `g`, `mask`, `circle`, `rect` (with `rx`), `path`, `polygon`, `line`; fill, stroke, stroke width, fill opacity, and the
 * role classes (`vs` sun, `vl` moon, `vn` cloud, `vm` dark cloud, `ve` water, `vg` snow, `vx` lightning, `vb` mist) that
 * give each layer its colour. A layer behind another is cut by a mask (the gap around a cloud): drawn in a layer of its own,
 * then the black shapes of the mask clear it.
 */
internal class SvgNode(val tag: String, val attrs: Map<String, String>, val kids: List<SvgNode>) {
  /** The outline of a shape, in the units of its box; null for a group or a mask. */
  val path: Path? by lazy { shapeOf(this) }
}

internal object SvgReader {
  private val TAG = Regex("""<(/?)([a-zA-Z]+)((?:\s+[a-zA-Z0-9:-]+="[^"]*")*)\s*(/?)>""")
  private val ATTR = Regex("""([a-zA-Z0-9:-]+)="([^"]*)"""")

  /** The elements of an SVG body under one root. Unknown tags are kept and drawn as nothing. */
  fun read(svg: String): SvgNode {
    class Open(val tag: String, val attrs: Map<String, String>, val kids: MutableList<SvgNode> = mutableListOf())
    val stack = ArrayDeque<Open>().apply { addLast(Open("svg", emptyMap())) }
    fun close() {
      val o = stack.removeLast()
      stack.last().kids += SvgNode(o.tag, o.attrs, o.kids)
    }
    for (m in TAG.findAll(svg)) {
      if (m.groupValues[1] == "/") {
        if (stack.size > 1) close()
        continue
      }
      val attrs = ATTR.findAll(m.groupValues[3]).associate { it.groupValues[1] to it.groupValues[2] }
      stack.addLast(Open(m.groupValues[2], attrs))
      if (m.groupValues[4] == "/") close()
    }
    while (stack.size > 1) close()
    val root = stack.last()
    return SvgNode(root.tag, root.attrs, root.kids)
  }
}

private fun SvgNode.f(name: String, default: Float = 0f): Float = attrs[name]?.toFloatOrNull() ?: default

private fun shapeOf(n: SvgNode): Path? =
  when (n.tag) {
    "circle" -> Path().apply { val r = n.f("r"); addOval(Rect(n.f("cx") - r, n.f("cy") - r, n.f("cx") + r, n.f("cy") + r)) }
    "rect" -> {
      val r = Rect(n.f("x"), n.f("y"), n.f("x") + n.f("width"), n.f("y") + n.f("height"))
      val rx = n.f("rx")
      Path().apply { if (rx > 0) addRoundRect(RoundRect(r, CornerRadius(rx))) else addRect(r) }
    }
    "path" -> n.attrs["d"]?.let { PathParser().parsePathString(it).toPath() }
    "polygon" -> {
      val v = n.attrs["points"].orEmpty().trim().split(Regex("[\\s,]+")).mapNotNull { it.toFloatOrNull() }
      Path().apply {
        for (i in 0 until v.size / 2) if (i == 0) moveTo(v[0], v[1]) else lineTo(v[2 * i], v[2 * i + 1])
        close()
      }
    }
    "line" -> Path().apply { moveTo(n.f("x1"), n.f("y1")); lineTo(n.f("x2"), n.f("y2")) }
    else -> null
  }

/** The style a node inherits: a paint is `none`, `currentColor` or a colour. */
private data class SvgStyle(val fill: String, val stroke: String, val width: Float, val fillOpacity: Float, val color: Color)

private fun parseColour(v: String): Color? =
  when {
    v == "#fff" -> Color.White
    v == "#000" -> Color.Black
    v.startsWith("#") && v.length == 7 -> Color(0xFF000000 or v.substring(1).toLong(16))
    else -> null
  }

private fun SvgStyle.under(n: SvgNode, roles: Map<String, Color>): SvgStyle {
  val a = n.attrs
  return SvgStyle(
    fill = a["fill"] ?: fill,
    stroke = a["stroke"] ?: stroke,
    width = a["stroke-width"]?.toFloatOrNull() ?: width,
    fillOpacity = a["fill-opacity"]?.toFloatOrNull() ?: fillOpacity,
    color = a["class"]?.let { roles[it] } ?: a["color"]?.let(::parseColour) ?: color,
  )
}

private fun SvgStyle.paint(v: String): Color? = when (v) { "none" -> null; "currentColor" -> color; else -> parseColour(v) }

private fun idOf(url: String): String = url.removePrefix("url(#").removeSuffix(")")

/** Draws an SVG [root] whose box is [box] wide, centred on ([cx], [cy]), [size] wide. */
internal fun DrawScope.drawSvg(root: SvgNode, box: Float, cx: Float, cy: Float, size: Float, roles: Map<String, Color>, base: SvgStyle0) {
  val masks = HashMap<String, SvgNode>()
  fun collect(n: SvgNode) {
    if (n.tag == "mask") n.attrs["id"]?.let { masks[it] = n }
    n.kids.forEach(::collect)
  }
  collect(root)
  val k = size / box
  withTransform({
    translate(cx - size / 2, cy - size / 2)
    scale(k, k, pivot = Offset.Zero)
  }) {
    fun erase(n: SvgNode, st: SvgStyle) {
      val s = st.under(n, roles)
      val p = n.path
      if (p != null) {
        if (s.paint(s.fill) == Color.Black) drawPath(p, Color.Black, blendMode = BlendMode.Clear)
        if (s.paint(s.stroke) == Color.Black) drawPath(p, Color.Black, style = Stroke(s.width, cap = StrokeCap.Round, join = StrokeJoin.Round), blendMode = BlendMode.Clear)
      }
      n.kids.forEach { erase(it, s) }
    }
    fun draw(n: SvgNode, st: SvgStyle) {
      if (n.tag == "mask") return
      val s = st.under(n, roles)
      val mask = n.attrs["mask"]?.let { masks[idOf(it)] }
      if (mask != null) {
        drawContext.canvas.saveLayer(Rect(-box / 2, -box / 2, box * 1.5f, box * 1.5f), Paint())
        n.kids.forEach { draw(it, s) }
        // SVG paints black by default: a shape of the mask without a fill erases.
        mask.kids.forEach { erase(it, SvgStyle("#000", "none", 1f, 1f, Color.Black)) }
        drawContext.canvas.restore()
        return
      }
      val p = n.path
      if (p != null) {
        s.paint(s.fill)?.let { drawPath(p, it.copy(alpha = it.alpha * s.fillOpacity)) }
        s.paint(s.stroke)?.let { drawPath(p, it, style = Stroke(s.width, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
      }
      n.kids.forEach { draw(it, s) }
    }
    draw(root, SvgStyle(base.fill, base.stroke, base.width, 1f, base.color))
  }
}

/** The style of the root of a drawing (the `<svg>` the card writes around it). */
internal class SvgStyle0(val fill: String, val stroke: String, val width: Float, val color: Color)

internal object FamilyIcons {
  private val icons = HashMap<String, SvgNode>()
  private val glyphs = HashMap<String, SvgNode>()

  /** The drawing of an icon of the family by its name (`soleil`, `eclaircies`…), null for an unknown one. */
  fun icon(name: String): SvgNode? = MERIDIEN_ICONS[name]?.let { icons.getOrPut(name) { SvgReader.read(it) } }

  fun glyph(name: String): SvgNode? = CARD_GLYPHS[name]?.let { glyphs.getOrPut(name) { SvgReader.read(it) } }
}

/** Draws the weather icon [kind] centred on ([cx], [cy]), [size] wide, in the colours of [palette]; nothing for null. */
internal fun DrawScope.familyIcon(kind: String?, cx: Float, cy: Float, size: Float, palette: BoardPalette) {
  val node = kind?.let(FamilyIcons::icon) ?: return
  drawSvg(node, 128f, cx, cy, size, palette.iconRoles, SvgStyle0("currentColor", "none", 1f, palette.text))
}

/** Draws the stroke glyph [name] of the card (a box of 24) centred on ([cx], [cy]), [size] wide. */
internal fun DrawScope.cardGlyph(name: String, cx: Float, cy: Float, size: Float, colour: Color, width: Float = 2f) {
  val node = FamilyIcons.glyph(name) ?: return
  drawSvg(node, 24f, cx, cy, size, emptyMap(), SvgStyle0("none", "currentColor", width, colour))
}

@Composable
internal fun FamilyIcon(kind: String?, size: Dp, palette: BoardPalette, modifier: Modifier = Modifier) {
  Canvas(modifier.size(size)) { familyIcon(kind, this.size.width / 2, this.size.height / 2, this.size.width, palette) }
}

@Composable
internal fun CardGlyph(name: String, size: Dp, colour: Color, width: Float = 2f, modifier: Modifier = Modifier) {
  Canvas(modifier.size(size)) { cardGlyph(name, this.size.width / 2, this.size.height / 2, this.size.width, colour, width) }
}
