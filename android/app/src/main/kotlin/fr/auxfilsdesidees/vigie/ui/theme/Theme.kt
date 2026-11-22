package fr.auxfilsdesidees.vigie.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val VigieScheme =
  darkColorScheme(
    primary = VigieColors.Accent,
    onPrimary = VigieColors.OnPill,
    secondary = VigieColors.Wind,
    background = VigieColors.SkyTop,
    onBackground = VigieColors.Text,
    surface = VigieColors.SkyTop,
    onSurface = VigieColors.Text,
    onSurfaceVariant = VigieColors.Text3,
    outline = VigieColors.Rule,
  )

/** One theme for now, the charter's « Ciel »: the light and plain dark themes come with the settings page. */
@Composable
fun VigieTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = VigieScheme, typography = Typography, content = content)
}
