import '/auth/firebase_auth/auth_util.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import 'dart:ui';
import '/index.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'profile_screen_model.dart';
export 'profile_screen_model.dart';

class ProfileScreenWidget extends StatefulWidget {
  const ProfileScreenWidget({super.key});

  static String routeName = 'profileScreen';
  static String routePath = 'profileScreen';

  @override
  State<ProfileScreenWidget> createState() => _ProfileScreenWidgetState();
}

class _ProfileScreenWidgetState extends State<ProfileScreenWidget> {
  late ProfileScreenModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => ProfileScreenModel());

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: scaffoldKey,
      backgroundColor: FlutterFlowTheme.of(context).secondaryBackground,
      body: Builder(
        builder: (context) {
          if (valueOrDefault<bool>(currentUserDocument?.subscribed, false) ==
              true || currentUserDocument?.role == Role.admin) {
            return Padding(
              padding: EdgeInsets.all(30.0),
              child: Column(
                mainAxisSize: MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    mainAxisSize: MainAxisSize.max,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.max,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          FlutterFlowIconButton(
                            borderRadius: 8.0,
                            borderWidth: 12.0,
                            buttonSize: 45.0,
                            fillColor: FlutterFlowTheme.of(context)
                                .secondaryBackground,
                            icon: Icon(
                              Icons.chevron_left,
                              color: FlutterFlowTheme.of(context).primaryText,
                              size: 24.0,
                            ),
                            onPressed: () async {
                              context.pushNamed(DashboardWidget.routeName);
                            },
                          ),
                          Padding(
                            padding: EdgeInsetsDirectional.fromSTEB(
                                0.0, 12.0, 0.0, 12.0),
                            child: Text(
                              'Profile',
                              style: FlutterFlowTheme.of(context)
                                  .labelMedium
                                  .override(
                                    font: GoogleFonts.inter(
                                      fontWeight: FontWeight.w500,
                                      fontStyle: FlutterFlowTheme.of(context)
                                          .labelMedium
                                          .fontStyle,
                                    ),
                                    fontSize: 20.0,
                                    letterSpacing: 0.0,
                                    fontWeight: FontWeight.w500,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .labelMedium
                                        .fontStyle,
                                  ),
                            ),
                          ),
                          Text(
                            '.',
                            style: FlutterFlowTheme.of(context)
                                .bodyMedium
                                .override(
                                  font: GoogleFonts.inter(
                                    fontWeight: FlutterFlowTheme.of(context)
                                        .bodyMedium
                                        .fontWeight,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .bodyMedium
                                        .fontStyle,
                                  ),
                                  color: FlutterFlowTheme.of(context)
                                      .secondaryBackground,
                                  letterSpacing: 0.0,
                                  fontWeight: FlutterFlowTheme.of(context)
                                      .bodyMedium
                                      .fontWeight,
                                  fontStyle: FlutterFlowTheme.of(context)
                                      .bodyMedium
                                      .fontStyle,
                                ),
                          ),
                        ].divide(SizedBox(width: 15.0)),
                      ),
                      Material(
                        color: Colors.transparent,
                        elevation: 1.0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(15.0),
                        ),
                        child: Container(
                          width: MediaQuery.sizeOf(context).width * 1.0,
                          decoration: BoxDecoration(
                            color: FlutterFlowTheme.of(context)
                                .secondaryBackground,
                            boxShadow: [
                              BoxShadow(
                                blurRadius: 1.0,
                                color: FlutterFlowTheme.of(context)
                                    .primaryBackground,
                                offset: Offset(
                                  0.0,
                                  0.0,
                                ),
                              )
                            ],
                            borderRadius: BorderRadius.circular(15.0),
                          ),
                          child: Padding(
                            padding: EdgeInsetsDirectional.fromSTEB(
                                24.0, 12.0, 24.0, 12.0),
                            child: Row(
                              mainAxisSize: MainAxisSize.max,
                              children: [
                                Container(
                                  width: 70.0,
                                  height: 70.0,
                                  decoration: BoxDecoration(
                                    color:
                                        FlutterFlowTheme.of(context).alternate,
                                    borderRadius: BorderRadius.circular(12.0),
                                  ),
                                  child: Padding(
                                    padding: EdgeInsets.all(2.0),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(10.0),
                                      child: Image.network(
                                        currentUserPhoto,
                                        width: 100.0,
                                        height: 100.0,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                  ),
                                ),
                                Padding(
                                  padding: EdgeInsetsDirectional.fromSTEB(
                                      16.0, 0.0, 0.0, 0.0),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.max,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        currentUserDisplayName,
                                        style: FlutterFlowTheme.of(context)
                                            .headlineSmall
                                            .override(
                                              font: GoogleFonts.interTight(
                                                fontWeight: FontWeight.w500,
                                                fontStyle:
                                                    FlutterFlowTheme.of(context)
                                                        .headlineSmall
                                                        .fontStyle,
                                              ),
                                              fontSize: 14.0,
                                              letterSpacing: 0.0,
                                              fontWeight: FontWeight.w500,
                                              fontStyle:
                                                  FlutterFlowTheme.of(context)
                                                      .headlineSmall
                                                      .fontStyle,
                                            ),
                                      ),
                                      Padding(
                                        padding: EdgeInsetsDirectional.fromSTEB(
                                            0.0, 4.0, 0.0, 0.0),
                                        child: Text(
                                          currentUserEmail,
                                          style: FlutterFlowTheme.of(context)
                                              .bodySmall
                                              .override(
                                                font: GoogleFonts.outfit(
                                                  fontWeight: FontWeight.w300,
                                                  fontStyle:
                                                      FlutterFlowTheme.of(
                                                              context)
                                                          .bodySmall
                                                          .fontStyle,
                                                ),
                                                color:
                                                    FlutterFlowTheme.of(context)
                                                        .primaryText,
                                                fontSize: 12.0,
                                                letterSpacing: 0.0,
                                                fontWeight: FontWeight.w300,
                                                fontStyle:
                                                    FlutterFlowTheme.of(context)
                                                        .bodySmall
                                                        .fontStyle,
                                              ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.max,
                        children: [
                          Padding(
                            padding: EdgeInsetsDirectional.fromSTEB(
                                0.0, 12.0, 0.0, 12.0),
                            child: Text(
                              'Account Settings',
                              style: FlutterFlowTheme.of(context)
                                  .labelMedium
                                  .override(
                                    font: GoogleFonts.inter(
                                      fontWeight: FontWeight.w500,
                                      fontStyle: FlutterFlowTheme.of(context)
                                          .labelMedium
                                          .fontStyle,
                                    ),
                                    fontSize: 14.0,
                                    letterSpacing: 0.0,
                                    fontWeight: FontWeight.w500,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .labelMedium
                                        .fontStyle,
                                  ),
                            ),
                          ),
                        ],
                      ),
                      InkWell(
                        splashColor: Colors.transparent,
                        focusColor: Colors.transparent,
                        hoverColor: Colors.transparent,
                        highlightColor: Colors.transparent,
                        onTap: () async {
                          context.pushNamed(ChangePasswordWidget.routeName);
                        },
                        child: Container(
                          width: double.infinity,
                          height: 60.0,
                          decoration: BoxDecoration(
                            color: FlutterFlowTheme.of(context)
                                .secondaryBackground,
                            boxShadow: [
                              BoxShadow(
                                blurRadius: 5.0,
                                color: Color(0x3416202A),
                                offset: Offset(
                                  0.0,
                                  2.0,
                                ),
                              )
                            ],
                            borderRadius: BorderRadius.circular(12.0),
                            shape: BoxShape.rectangle,
                          ),
                          child: Padding(
                            padding: EdgeInsets.all(17.0),
                            child: Row(
                              mainAxisSize: MainAxisSize.max,
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Change Password',
                                  style: FlutterFlowTheme.of(context)
                                      .labelMedium
                                      .override(
                                        font: GoogleFonts.inter(
                                          fontWeight:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontWeight,
                                          fontStyle:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontStyle,
                                        ),
                                        fontSize: 12.0,
                                        letterSpacing: 0.0,
                                        fontWeight: FlutterFlowTheme.of(context)
                                            .labelMedium
                                            .fontWeight,
                                        fontStyle: FlutterFlowTheme.of(context)
                                            .labelMedium
                                            .fontStyle,
                                      ),
                                ),
                                Icon(
                                  Icons.arrow_forward_ios,
                                  color: FlutterFlowTheme.of(context)
                                      .secondaryText,
                                  size: 17.0,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      InkWell(
                        splashColor: Colors.transparent,
                        focusColor: Colors.transparent,
                        hoverColor: Colors.transparent,
                        highlightColor: Colors.transparent,
                        onTap: () async {
                          context.pushNamed(EditProfileScreenWidget.routeName);
                        },
                        child: Container(
                          width: double.infinity,
                          height: 60.0,
                          decoration: BoxDecoration(
                            color: FlutterFlowTheme.of(context)
                                .secondaryBackground,
                            boxShadow: [
                              BoxShadow(
                                blurRadius: 5.0,
                                color: Color(0x3416202A),
                                offset: Offset(
                                  0.0,
                                  2.0,
                                ),
                              )
                            ],
                            borderRadius: BorderRadius.circular(12.0),
                            shape: BoxShape.rectangle,
                          ),
                          child: Padding(
                            padding: EdgeInsets.all(17.0),
                            child: Row(
                              mainAxisSize: MainAxisSize.max,
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Edit Profile',
                                  style: FlutterFlowTheme.of(context)
                                      .labelMedium
                                      .override(
                                        font: GoogleFonts.inter(
                                          fontWeight:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontWeight,
                                          fontStyle:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontStyle,
                                        ),
                                        fontSize: 12.0,
                                        letterSpacing: 0.0,
                                        fontWeight: FlutterFlowTheme.of(context)
                                            .labelMedium
                                            .fontWeight,
                                        fontStyle: FlutterFlowTheme.of(context)
                                            .labelMedium
                                            .fontStyle,
                                      ),
                                ),
                                Align(
                                  alignment: AlignmentDirectional(0.9, 0.0),
                                  child: Icon(
                                    Icons.arrow_forward_ios,
                                    color: FlutterFlowTheme.of(context)
                                        .secondaryText,
                                    size: 17.0,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (currentUserDocument?.role != Role.agent)
                        InkWell(
                          splashColor: Colors.transparent,
                          focusColor: Colors.transparent,
                          hoverColor: Colors.transparent,
                          highlightColor: Colors.transparent,
                          onTap: () async {
                            context.pushNamed(
                              StartupWidget.routeName,
                              queryParameters: {
                                'update': serializeParam(
                                  true,
                                  ParamType.bool,
                                ),
                              }.withoutNulls,
                            );
                          },
                          child: Container(
                            width: double.infinity,
                            height: 60.0,
                            decoration: BoxDecoration(
                              color: FlutterFlowTheme.of(context)
                                  .secondaryBackground,
                              boxShadow: [
                                BoxShadow(
                                  blurRadius: 5.0,
                                  color: Color(0x3416202A),
                                  offset: Offset(
                                    0.0,
                                    2.0,
                                  ),
                                )
                              ],
                              borderRadius: BorderRadius.circular(12.0),
                              shape: BoxShape.rectangle,
                            ),
                            child: Padding(
                              padding: EdgeInsets.all(17.0),
                              child: Row(
                                mainAxisSize: MainAxisSize.max,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Business Info',
                                    style: FlutterFlowTheme.of(context)
                                        .labelMedium
                                        .override(
                                          font: GoogleFonts.inter(
                                            fontWeight:
                                                FlutterFlowTheme.of(context)
                                                    .labelMedium
                                                    .fontWeight,
                                            fontStyle:
                                                FlutterFlowTheme.of(context)
                                                    .labelMedium
                                                    .fontStyle,
                                          ),
                                          fontSize: 12.0,
                                          letterSpacing: 0.0,
                                          fontWeight:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontWeight,
                                          fontStyle:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontStyle,
                                        ),
                                  ),
                                  Align(
                                    alignment: AlignmentDirectional(0.9, 0.0),
                                    child: Icon(
                                      Icons.arrow_forward_ios,
                                      color: FlutterFlowTheme.of(context)
                                          .secondaryText,
                                      size: 17.0,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ].divide(SizedBox(height: 12.0)),
                  ),
                  Padding(
                    padding:
                        EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 60.0),
                    child: FFButtonWidget(
                      onPressed: () async {
                        GoRouter.of(context).prepareAuthEvent();
                        await authManager.signOut();
                        GoRouter.of(context).clearRedirectLocation();

                        context.goNamedAuth(
                          LoginScreenWidget.routeName,
                          context.mounted,
                          extra: <String, dynamic>{
                            kTransitionInfoKey: TransitionInfo(
                              hasTransition: true,
                              transitionType: PageTransitionType.fade,
                            ),
                          },
                        );
                      },
                      text: 'Log Out',
                      options: FFButtonOptions(
                        width: 150.0,
                        height: 50.0,
                        padding:
                            EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                        iconPadding:
                            EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                        color: FlutterFlowTheme.of(context).secondaryBackground,
                        textStyle: FlutterFlowTheme.of(context)
                            .bodySmall
                            .override(
                              font: GoogleFonts.lexendDeca(
                                fontWeight: FontWeight.w500,
                                fontStyle: FlutterFlowTheme.of(context)
                                    .bodySmall
                                    .fontStyle,
                              ),
                              color: FlutterFlowTheme.of(context).primaryText,
                              fontSize: 13.0,
                              letterSpacing: 0.0,
                              fontWeight: FontWeight.w500,
                              fontStyle: FlutterFlowTheme.of(context)
                                  .bodySmall
                                  .fontStyle,
                            ),
                        elevation: 1.0,
                        borderSide: BorderSide(
                          color: Colors.transparent,
                          width: 1.0,
                        ),
                        borderRadius: BorderRadius.circular(14.0),
                      ),
                    ),
                  ),
                ],
              ),
            );
          } else {
            return Align(
              alignment: AlignmentDirectional(0.0, 0.0),
              child: wrapWithModel(
                model: _model.subscribeModel,
                updateCallback: () => safeSetState(() {}),
                child: SubscribeWidget(),
              ),
            );
          }
        },
      ),
    );
  }
}
