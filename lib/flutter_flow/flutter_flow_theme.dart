// ignore_for_file: overridden_fields, annotate_overrides

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract class FlutterFlowTheme {
  static FlutterFlowTheme of(BuildContext context) {
    return LightModeTheme();
  }

  @Deprecated('Use primary instead')
  Color get primaryColor => primary;
  @Deprecated('Use secondary instead')
  Color get secondaryColor => secondary;
  @Deprecated('Use tertiary instead')
  Color get tertiaryColor => tertiary;

  late Color primary;
  late Color secondary;
  late Color tertiary;
  late Color alternate;
  late Color primaryText;
  late Color secondaryText;
  late Color primaryBackground;
  late Color secondaryBackground;
  late Color accent1;
  late Color accent2;
  late Color accent3;
  late Color accent4;
  late Color success;
  late Color warning;
  late Color error;
  late Color info;

  late Color customColor1;
  late Color customColor2;
  late Color customColor3;
  late Color customColor4;
  late Color customColor5;
  late Color customColor6;
  late Color customColor7;
  late Color customColor8;
  late Color customColor9;
  late Color customColor10;
  late Color customColor11;
  late Color customColor12;
  late Color customColor13;
  late Color customColor14;
  late Color customColor15;
  late Color customColor16;
  late Color customColor17;
  late Color customColor18;
  late Color customColor19;
  late Color customColor20;
  late Color customColor21;
  late Color customColor22;
  late Color customColor23;
  late Color customColor24;
  late Color customColor25;
  late Color customColor26;
  late Color customColor27;
  late Color customColor28;
  late Color customColor29;
  late Color customColor30;
  late Color customColor31;
  late Color customColor32;
  late Color customColor33;
  late Color customColor34;
  late Color customColor35;
  late Color customColor36;
  late Color customColor37;
  late Color customColor38;
  late Color customColor39;
  late Color customColor40;
  late Color customColor41;
  late Color customColor42;
  late Color customColor43;
  late Color customColor44;
  late Color customColor45;
  late Color customColor46;
  late Color customColor47;
  late Color customColor48;
  late Color customColor49;
  late Color customColor50;
  late Color customColor51;
  late Color customColor52;
  late Color customColor53;
  late Color customColor54;
  late Color customColor55;
  late Color customColor56;
  late Color customColor57;
  late Color customColor58;
  late Color customColor59;
  late Color customColor60;
  late Color customColor61;
  late Color customColor62;
  late Color customColor63;
  late Color customColor64;
  late Color customColor65;
  late Color customColor66;
  late Color customColor67;
  late Color customColor68;
  late Color customColor69;
  late Color customColor70;
  late Color customColor71;
  late Color customColor72;
  late Color customColor73;
  late Color customColor74;
  late Color customColor75;
  late Color customColor76;
  late Color customColor77;
  late Color customColor78;
  late Color customColor79;
  late Color customColor80;
  late Color customColor81;
  late Color customColor82;
  late Color customColor83;
  late Color customColor84;
  late Color customColor85;
  late Color customColor86;
  late Color customColor87;
  late Color customColor88;
  late Color customColor89;
  late Color customColor90;
  late Color customColor91;
  late Color customColor92;
  late Color customColor93;
  late Color customColor94;
  late Color customColor95;
  late Color customColor96;
  late Color customColor97;
  late Color customColor98;
  late Color customColor99;
  late Color customColor100;
  late Color jobSucces;
  late Color customColor101;
  late Color customColor102;
  late Color customColor103;
  late Color customColor104;
  late Color customColor105;
  late Color customColor106;
  late Color customColor107;
  late Color customColor108;
  late Color customColor109;
  late Color customColor110;
  late Color customColor111;
  late Color customColor112;
  late Color customColor113;
  late Color customColor114;
  late Color customColor115;

  @Deprecated('Use displaySmallFamily instead')
  String get title1Family => displaySmallFamily;
  @Deprecated('Use displaySmall instead')
  TextStyle get title1 => typography.displaySmall;
  @Deprecated('Use headlineMediumFamily instead')
  String get title2Family => typography.headlineMediumFamily;
  @Deprecated('Use headlineMedium instead')
  TextStyle get title2 => typography.headlineMedium;
  @Deprecated('Use headlineSmallFamily instead')
  String get title3Family => typography.headlineSmallFamily;
  @Deprecated('Use headlineSmall instead')
  TextStyle get title3 => typography.headlineSmall;
  @Deprecated('Use titleMediumFamily instead')
  String get subtitle1Family => typography.titleMediumFamily;
  @Deprecated('Use titleMedium instead')
  TextStyle get subtitle1 => typography.titleMedium;
  @Deprecated('Use titleSmallFamily instead')
  String get subtitle2Family => typography.titleSmallFamily;
  @Deprecated('Use titleSmall instead')
  TextStyle get subtitle2 => typography.titleSmall;
  @Deprecated('Use bodyMediumFamily instead')
  String get bodyText1Family => typography.bodyMediumFamily;
  @Deprecated('Use bodyMedium instead')
  TextStyle get bodyText1 => typography.bodyMedium;
  @Deprecated('Use bodySmallFamily instead')
  String get bodyText2Family => typography.bodySmallFamily;
  @Deprecated('Use bodySmall instead')
  TextStyle get bodyText2 => typography.bodySmall;

  String get displayLargeFamily => typography.displayLargeFamily;
  bool get displayLargeIsCustom => typography.displayLargeIsCustom;
  TextStyle get displayLarge => typography.displayLarge;
  String get displayMediumFamily => typography.displayMediumFamily;
  bool get displayMediumIsCustom => typography.displayMediumIsCustom;
  TextStyle get displayMedium => typography.displayMedium;
  String get displaySmallFamily => typography.displaySmallFamily;
  bool get displaySmallIsCustom => typography.displaySmallIsCustom;
  TextStyle get displaySmall => typography.displaySmall;
  String get headlineLargeFamily => typography.headlineLargeFamily;
  bool get headlineLargeIsCustom => typography.headlineLargeIsCustom;
  TextStyle get headlineLarge => typography.headlineLarge;
  String get headlineMediumFamily => typography.headlineMediumFamily;
  bool get headlineMediumIsCustom => typography.headlineMediumIsCustom;
  TextStyle get headlineMedium => typography.headlineMedium;
  String get headlineSmallFamily => typography.headlineSmallFamily;
  bool get headlineSmallIsCustom => typography.headlineSmallIsCustom;
  TextStyle get headlineSmall => typography.headlineSmall;
  String get titleLargeFamily => typography.titleLargeFamily;
  bool get titleLargeIsCustom => typography.titleLargeIsCustom;
  TextStyle get titleLarge => typography.titleLarge;
  String get titleMediumFamily => typography.titleMediumFamily;
  bool get titleMediumIsCustom => typography.titleMediumIsCustom;
  TextStyle get titleMedium => typography.titleMedium;
  String get titleSmallFamily => typography.titleSmallFamily;
  bool get titleSmallIsCustom => typography.titleSmallIsCustom;
  TextStyle get titleSmall => typography.titleSmall;
  String get labelLargeFamily => typography.labelLargeFamily;
  bool get labelLargeIsCustom => typography.labelLargeIsCustom;
  TextStyle get labelLarge => typography.labelLarge;
  String get labelMediumFamily => typography.labelMediumFamily;
  bool get labelMediumIsCustom => typography.labelMediumIsCustom;
  TextStyle get labelMedium => typography.labelMedium;
  String get labelSmallFamily => typography.labelSmallFamily;
  bool get labelSmallIsCustom => typography.labelSmallIsCustom;
  TextStyle get labelSmall => typography.labelSmall;
  String get bodyLargeFamily => typography.bodyLargeFamily;
  bool get bodyLargeIsCustom => typography.bodyLargeIsCustom;
  TextStyle get bodyLarge => typography.bodyLarge;
  String get bodyMediumFamily => typography.bodyMediumFamily;
  bool get bodyMediumIsCustom => typography.bodyMediumIsCustom;
  TextStyle get bodyMedium => typography.bodyMedium;
  String get bodySmallFamily => typography.bodySmallFamily;
  bool get bodySmallIsCustom => typography.bodySmallIsCustom;
  TextStyle get bodySmall => typography.bodySmall;

  Typography get typography => ThemeTypography(this);
}

class LightModeTheme extends FlutterFlowTheme {
  @Deprecated('Use primary instead')
  Color get primaryColor => primary;
  @Deprecated('Use secondary instead')
  Color get secondaryColor => secondary;
  @Deprecated('Use tertiary instead')
  Color get tertiaryColor => tertiary;

  late Color primary = const Color(0xFF0F766E);
  late Color secondary = const Color(0xFF1F2937);
  late Color tertiary = const Color(0xFF21CABC);
  late Color alternate = const Color(0xFFE0E3E7);
  late Color primaryText = const Color(0xFFFFFFFF);
  late Color secondaryText = const Color(0xFF9CA3AF);
  late Color primaryBackground = const Color(0xFF111827);
  late Color secondaryBackground = const Color(0xFF030712);
  late Color accent1 = const Color(0xFF0D9488);
  late Color accent2 = const Color(0xFFB2A694);
  late Color accent3 = const Color(0xFFDBEAFE);
  late Color accent4 = const Color(0xCCFFFFFF);
  late Color success = const Color(0xFF249689);
  late Color warning = const Color(0xFFF9CF58);
  late Color error = const Color(0xFFFF5963);
  late Color info = const Color(0xFFFFFFFF);

  late Color customColor1 = const Color(0xFF22C55E);
  late Color customColor2 = const Color(0xFFE8F9EF);
  late Color customColor3 = const Color(0xFFF6EEFE);
  late Color customColor4 = const Color(0xFFFEF1E7);
  late Color customColor5 = const Color(0xFFF9FAFB);
  late Color customColor6 = const Color(0xFFE4E4E7);
  late Color customColor7 = const Color(0xFF71717A);
  late Color customColor8 = const Color(0xFFF3F4F6);
  late Color customColor9 = const Color(0xFF9A3412);
  late Color customColor10 = const Color(0xFFC1042B);
  late Color customColor11 = const Color(0xFFF1E7FE);
  late Color customColor12 = const Color(0xFF6B21A8);
  late Color customColor13 = const Color(0xFF0FDC19);
  late Color customColor14 = const Color(0xFF1056EC);
  late Color customColor15 = const Color(0xFFF9FAFB);
  late Color customColor16 = const Color(0xFFDBEAFE);
  late Color customColor17 = const Color(0xFF0771C9);
  late Color customColor18 = const Color(0xFF166534);
  late Color customColor19 = const Color(0xFF1F2937);
  late Color customColor20 = const Color(0xFFFEF9C3);
  late Color customColor21 = const Color(0xFF854D0E);
  late Color customColor22 = const Color(0xFFF3E8FF);
  late Color customColor23 = const Color(0xFF9333EA);
  late Color customColor24 = const Color(0xFF6B7280);
  late Color customColor25 = const Color(0xFFF9FAFB);
  late Color customColor26 = const Color(0xFFEF4444);
  late Color customColor27 = const Color(0xFFF9F9FA);
  late Color customColor28 = const Color(0xFF1F2937);
  late Color customColor29 = const Color(0xFF854D0E);
  late Color customColor30 = const Color(0xFFFFFBEB);
  late Color customColor31 = const Color(0xFFF79CDD);
  late Color customColor32 = const Color(0xFF1E40AF);
  late Color customColor33 = const Color(0xFFDAE6FF);
  late Color customColor34 = const Color(0xFF8AD1A4);
  late Color customColor35 = const Color(0xFF642202);
  late Color customColor36 = const Color(0xFF9CA3AF);
  late Color customColor37 = const Color(0xFFA2F69A);
  late Color customColor38 = const Color(0xFFF0FDF4);
  late Color customColor39 = const Color(0xFF15803D);
  late Color customColor40 = const Color(0xFF6FF627);
  late Color customColor41 = const Color(0xFF6B7280);
  late Color customColor42 = const Color(0xFFE4E4E7);
  late Color customColor43 = const Color(0xFF60D827);
  late Color customColor44 = const Color(0xFFFFFBEB);
  late Color customColor45 = const Color(0xFFFE86EE);
  late Color customColor46 = const Color(0xFF895A0C);
  late Color customColor47 = const Color(0xFFFFEDD5);
  late Color customColor48 = const Color(0xFF787BA3);
  late Color customColor49 = const Color(0xFFEFF6FF);
  late Color customColor50 = const Color(0xFF10B981);
  late Color customColor51 = const Color(0xFF6366F1);
  late Color customColor52 = const Color(0xFF98ADD4);
  late Color customColor53 = const Color(0xFF991B1B);
  late Color customColor54 = const Color(0xFF5096FA);
  late Color customColor55 = const Color(0xFF6B7280);
  late Color customColor56 = const Color(0xFF7AF0B8);
  late Color customColor57 = const Color(0xFFF3F4F6);
  late Color customColor58 = const Color(0xFFDCFCE7);
  late Color customColor59 = const Color(0xFFF0FDF4);
  late Color customColor60 = const Color(0xFF166534);
  late Color customColor61 = const Color(0xFF5AE17A);
  late Color customColor62 = const Color(0xFFEFF6FF);
  late Color customColor63 = const Color(0xFF1E3A8A);
  late Color customColor64 = const Color(0xFF2540AF);
  late Color customColor65 = const Color(0xFFD8A624);
  late Color customColor66 = const Color(0xFFFFFBEB);
  late Color customColor67 = const Color(0xFFE4E4E7);
  late Color customColor68 = const Color(0xFF4236F2);
  late Color customColor69 = const Color(0xFF1B48AA);
  late Color customColor70 = const Color(0xFFD1D5DB);
  late Color customColor71 = const Color(0xFFF3F4F6);
  late Color customColor72 = const Color(0xFFBB9FD2);
  late Color customColor73 = const Color(0xFF2563EB);
  late Color customColor74 = const Color(0xFF22C55E);
  late Color customColor75 = const Color(0xFF3B82F6);
  late Color customColor76 = const Color(0xFFA855F7);
  late Color customColor77 = const Color(0xFFF59E0B);
  late Color customColor78 = const Color(0xFFF3F4F6);
  late Color customColor79 = const Color(0xFFDBEAFE);
  late Color customColor80 = const Color(0xFFDCFCE7);
  late Color customColor81 = const Color(0xFFF3E8FF);
  late Color customColor82 = const Color(0xFFFFEDD5);
  late Color customColor83 = const Color(0xFF2563EB);
  late Color customColor84 = const Color(0xFF16A34A);
  late Color customColor85 = const Color(0xFFEA580C);
  late Color customColor86 = const Color(0xFF9F49ED);
  late Color customColor87 = const Color(0xFF7F95FF);
  late Color customColor88 = const Color(0xFF22C55E);
  late Color customColor89 = const Color(0xFFEFF6FF);
  late Color customColor90 = const Color(0xFFF9FAFB);
  late Color customColor91 = const Color(0xFF9CA3AF);
  late Color customColor92 = const Color(0xFFFEF3F1);
  late Color customColor93 = const Color(0xFFFEF9C3);
  late Color customColor94 = const Color(0xFFFFEDD5);
  late Color customColor95 = const Color(0xFFDBEAFE);
  late Color customColor96 = const Color(0xFFF1E7FE);
  late Color customColor97 = const Color(0xFFFEFAC2);
  late Color customColor98 = const Color(0xFFDCFDE6);
  late Color customColor99 = const Color(0xFF6B4AC5);
  late Color customColor100 = const Color(0xFFB66B0E);
  late Color jobSucces = const Color(0xFF166534);
  late Color customColor101 = const Color(0xFF0041FF);
  late Color customColor102 = const Color(0xFF49A821);
  late Color customColor103 = const Color(0xFF0041FF);
  late Color customColor104 = const Color(0xFFE5E7EB);
  late Color customColor105 = const Color(0xFF1B9B4A);
  late Color customColor106 = const Color(0xFF7E085E);
  late Color customColor107 = const Color(0xFFC7C8CC);
  late Color customColor108 = const Color(0xFFF1F5FE);
  late Color customColor109 = const Color(0xFFE1EAFB);
  late Color customColor110 = const Color(0xFF8E8482);
  late Color customColor111 = const Color(0xFF64825E);
  late Color customColor112 = const Color(0xFF71717A);
  late Color customColor113 = const Color(0xFFD78A80);
  late Color customColor114 = const Color(0xFF22C55E);
  late Color customColor115 = const Color(0xFFB9B9C9);
}

abstract class Typography {
  String get displayLargeFamily;
  bool get displayLargeIsCustom;
  TextStyle get displayLarge;
  String get displayMediumFamily;
  bool get displayMediumIsCustom;
  TextStyle get displayMedium;
  String get displaySmallFamily;
  bool get displaySmallIsCustom;
  TextStyle get displaySmall;
  String get headlineLargeFamily;
  bool get headlineLargeIsCustom;
  TextStyle get headlineLarge;
  String get headlineMediumFamily;
  bool get headlineMediumIsCustom;
  TextStyle get headlineMedium;
  String get headlineSmallFamily;
  bool get headlineSmallIsCustom;
  TextStyle get headlineSmall;
  String get titleLargeFamily;
  bool get titleLargeIsCustom;
  TextStyle get titleLarge;
  String get titleMediumFamily;
  bool get titleMediumIsCustom;
  TextStyle get titleMedium;
  String get titleSmallFamily;
  bool get titleSmallIsCustom;
  TextStyle get titleSmall;
  String get labelLargeFamily;
  bool get labelLargeIsCustom;
  TextStyle get labelLarge;
  String get labelMediumFamily;
  bool get labelMediumIsCustom;
  TextStyle get labelMedium;
  String get labelSmallFamily;
  bool get labelSmallIsCustom;
  TextStyle get labelSmall;
  String get bodyLargeFamily;
  bool get bodyLargeIsCustom;
  TextStyle get bodyLarge;
  String get bodyMediumFamily;
  bool get bodyMediumIsCustom;
  TextStyle get bodyMedium;
  String get bodySmallFamily;
  bool get bodySmallIsCustom;
  TextStyle get bodySmall;
}

class ThemeTypography extends Typography {
  ThemeTypography(this.theme);

  final FlutterFlowTheme theme;

  String get displayLargeFamily => 'Inter Tight';
  bool get displayLargeIsCustom => false;
  TextStyle get displayLarge => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 64.0,
      );
  String get displayMediumFamily => 'Inter Tight';
  bool get displayMediumIsCustom => false;
  TextStyle get displayMedium => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 44.0,
      );
  String get displaySmallFamily => 'Inter Tight';
  bool get displaySmallIsCustom => false;
  TextStyle get displaySmall => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 36.0,
      );
  String get headlineLargeFamily => 'Inter Tight';
  bool get headlineLargeIsCustom => false;
  TextStyle get headlineLarge => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 32.0,
      );
  String get headlineMediumFamily => 'Inter Tight';
  bool get headlineMediumIsCustom => false;
  TextStyle get headlineMedium => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 28.0,
      );
  String get headlineSmallFamily => 'Inter Tight';
  bool get headlineSmallIsCustom => false;
  TextStyle get headlineSmall => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 24.0,
      );
  String get titleLargeFamily => 'Inter Tight';
  bool get titleLargeIsCustom => false;
  TextStyle get titleLarge => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 20.0,
      );
  String get titleMediumFamily => 'Inter Tight';
  bool get titleMediumIsCustom => false;
  TextStyle get titleMedium => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 18.0,
      );
  String get titleSmallFamily => 'Inter Tight';
  bool get titleSmallIsCustom => false;
  TextStyle get titleSmall => GoogleFonts.interTight(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 16.0,
      );
  String get labelLargeFamily => 'Inter';
  bool get labelLargeIsCustom => false;
  TextStyle get labelLarge => GoogleFonts.inter(
        color: theme.secondaryText,
        fontWeight: FontWeight.normal,
        fontSize: 16.0,
      );
  String get labelMediumFamily => 'Inter';
  bool get labelMediumIsCustom => false;
  TextStyle get labelMedium => GoogleFonts.inter(
        color: theme.secondaryText,
        fontWeight: FontWeight.normal,
        fontSize: 14.0,
      );
  String get labelSmallFamily => 'Inter';
  bool get labelSmallIsCustom => false;
  TextStyle get labelSmall => GoogleFonts.inter(
        color: theme.secondaryText,
        fontWeight: FontWeight.normal,
        fontSize: 12.0,
      );
  String get bodyLargeFamily => 'Inter';
  bool get bodyLargeIsCustom => false;
  TextStyle get bodyLarge => GoogleFonts.inter(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 16.0,
      );
  String get bodyMediumFamily => 'Inter';
  bool get bodyMediumIsCustom => false;
  TextStyle get bodyMedium => GoogleFonts.inter(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 14.0,
      );
  String get bodySmallFamily => 'Inter';
  bool get bodySmallIsCustom => false;
  TextStyle get bodySmall => GoogleFonts.inter(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 12.0,
      );
}

extension TextStyleHelper on TextStyle {
  TextStyle override({
    TextStyle? font,
    String? fontFamily,
    Color? color,
    double? fontSize,
    FontWeight? fontWeight,
    double? letterSpacing,
    FontStyle? fontStyle,
    bool useGoogleFonts = false,
    TextDecoration? decoration,
    double? lineHeight,
    List<Shadow>? shadows,
    String? package,
  }) {
    if (useGoogleFonts && fontFamily != null) {
      font = GoogleFonts.getFont(fontFamily,
          fontWeight: fontWeight ?? this.fontWeight,
          fontStyle: fontStyle ?? this.fontStyle);
    }

    return font != null
        ? font.copyWith(
            color: color ?? this.color,
            fontSize: fontSize ?? this.fontSize,
            letterSpacing: letterSpacing ?? this.letterSpacing,
            fontWeight: fontWeight ?? this.fontWeight,
            fontStyle: fontStyle ?? this.fontStyle,
            decoration: decoration,
            height: lineHeight,
            shadows: shadows,
          )
        : copyWith(
            fontFamily: fontFamily,
            package: package,
            color: color,
            fontSize: fontSize,
            letterSpacing: letterSpacing,
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            decoration: decoration,
            height: lineHeight,
            shadows: shadows,
          );
  }
}
