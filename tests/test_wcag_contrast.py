def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def luminance(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = (int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    r_lin = srgb_to_linear(r)
    g_lin = srgb_to_linear(g)
    b_lin = srgb_to_linear(b)
    return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin

def contrast_ratio(hex1, hex2):
    l1 = luminance(hex1)
    l2 = luminance(hex2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

def test_light_theme_meets_wcag_aa():
    """Verify primary, heading, accent, stats, and footer text in light theme meet WCAG AA (> 4.5:1)."""
    bg = "#FFFFFF"
    heading = "#0B1B3A"
    text = "#334155"
    accent = "#2563EB"
    footer_text = "#334155"
    stat_bg = "#F8FAFC"
    stat_val = "#0B1B3A"
    stat_lbl = "#475569"

    assert contrast_ratio(bg, heading) >= 7.0   # AAA level (~16.5:1)
    assert contrast_ratio(bg, text) >= 4.5      # AA level (~8.9:1)
    assert contrast_ratio(bg, accent) >= 4.5    # AA level (~4.6:1)
    assert contrast_ratio(bg, footer_text) >= 4.5 # AA level (~8.9:1)
    assert contrast_ratio(stat_bg, stat_val) >= 7.0 # AAA level (~15.6:1)
    assert contrast_ratio(stat_bg, stat_lbl) >= 4.5 # AA level (~5.5:1)

def test_standard_dark_theme_meets_wcag_aa():
    """Verify primary, heading, accent, stats, and footer text in dark theme meet WCAG AA (> 4.5:1)."""
    bg_page = "#0B1220"
    bg_card = "#111B2E"
    text_primary = "#F8FAFC"
    text_body = "#94A3B8"
    accent = "#7DD3FC"
    footer_text = "#CBD5E1"
    stat_bg = "#0F172A"
    stat_val = "#F8FAFC"
    stat_lbl = "#94A3B8"

    assert contrast_ratio(bg_page, text_primary) >= 7.0 # AAA level (~15.8:1)
    assert contrast_ratio(bg_card, text_primary) >= 7.0 # AAA level (~14.8:1)
    assert contrast_ratio(bg_card, text_body) >= 4.5    # AA level (~5.4:1)
    assert contrast_ratio(bg_card, accent) >= 7.0       # AAA level (~11.5:1)
    assert contrast_ratio(bg_card, footer_text) >= 7.0  # AAA level (~10.4:1)
    assert contrast_ratio(stat_bg, stat_val) >= 7.0     # AAA level (~15.8:1)
    assert contrast_ratio(stat_bg, stat_lbl) >= 4.5     # AA level (~5.7:1)


