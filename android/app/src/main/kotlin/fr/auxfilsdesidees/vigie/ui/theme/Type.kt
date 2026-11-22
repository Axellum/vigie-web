package fr.auxfilsdesidees.vigie.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The charter's scale for a phone read at 30-60 cm: bold (700) for figures, verdicts and titles, medium (500) for running
 * text; big figure 56-96, card title 20-22, body 16, small 13, never under 12. Roboto is Android's default font.
 */
val Typography =
  Typography(
    displayLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 88.sp, lineHeight = 92.sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Bold, fontSize = 18.sp, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp),
  )
