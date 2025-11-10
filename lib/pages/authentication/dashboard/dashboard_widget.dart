import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/dispatch/calls/audio_component/audio_component_widget.dart';
import '/pages/dispatch/calls/call_details/call_details_widget.dart';
import '/pages/dispatch/calls/summary_comp/summary_comp_widget.dart';
import 'dart:ui';
import '/index.dart';
import 'package:aligned_dialog/aligned_dialog.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'dashboard_model.dart';
export 'dashboard_model.dart';

class DashboardWidget extends StatefulWidget {
  const DashboardWidget({super.key});

  static String routeName = 'Dashboard';
  static String routePath = 'dashboard';

  @override
  State<DashboardWidget> createState() => _DashboardWidgetState();
}

class _DashboardWidgetState extends State<DashboardWidget> {
  late DashboardModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => DashboardModel());

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        FocusScope.of(context).unfocus();
        FocusManager.instance.primaryFocus?.unfocus();
      },
      child: Scaffold(
        key: scaffoldKey,
        backgroundColor: FlutterFlowTheme.of(context).secondaryBackground,
        body: SafeArea(
          top: true,
          child: Column(
            mainAxisSize: MainAxisSize.max,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  mainAxisSize: MainAxisSize.max,
                  children: [
                    wrapWithModel(
                      model: _model.navbarModel,
                      updateCallback: () => safeSetState(() {}),
                      updateOnChange: true,
                      child: NavbarWidget(
                        pageNum: 0.0,
                      ),
                    ),
                    Expanded(
                      child: Column(
                        mainAxisSize: MainAxisSize.max,
                        children: [
                          wrapWithModel(
                            model: _model.headerModel,
                            updateCallback: () => safeSetState(() {}),
                            updateOnChange: true,
                            child: HeaderWidget(
                              heading: 'Dashboard',
                              subHeading: ' ',
                            ),
                          ),
                          Expanded(
                            child: Builder(
                              builder: (context) {
                                if (valueOrDefault<bool>(
                                        currentUserDocument?.subscribed,
                                        false) ==
                                    true || currentUserDocument?.role == Role.admin) {
                                  return Padding(
                                    padding: EdgeInsets.all(15.0),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.max,
                                      children: [
                                        Row(
                                          mainAxisSize: MainAxisSize.max,
                                          mainAxisAlignment:
                                              MainAxisAlignment.spaceBetween,
                                          children: [
                                            Column(
                                              mainAxisSize: MainAxisSize.max,
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                RichText(
                                                  textScaler:
                                                      MediaQuery.of(context)
                                                          .textScaler,
                                                  text: TextSpan(
                                                    children: [
                                                      TextSpan(
                                                        text: 'Good Evening, ',
                                                        style: FlutterFlowTheme
                                                                .of(context)
                                                            .bodyMedium
                                                            .override(
                                                              font: GoogleFonts
                                                                  .inter(
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w600,
                                                                fontStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                              ),
                                                              fontSize: 17.0,
                                                              letterSpacing:
                                                                  0.0,
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w600,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                            ),
                                                      ),
                                                      TextSpan(
                                                        text:
                                                            currentUserDisplayName,
                                                        style: TextStyle(),
                                                      )
                                                    ],
                                                    style: FlutterFlowTheme.of(
                                                            context)
                                                        .bodyMedium
                                                        .override(
                                                          font:
                                                              GoogleFonts.inter(
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                          ),
                                                          fontSize: 17.0,
                                                          letterSpacing: 0.0,
                                                          fontWeight:
                                                              FontWeight.w600,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                  ),
                                                ),
                                                Text(
                                                  'Here\'s a snapshot of your business performance',
                                                  style: FlutterFlowTheme.of(
                                                          context)
                                                      .bodyMedium
                                                      .override(
                                                        font: GoogleFonts.inter(
                                                          fontWeight:
                                                              FontWeight.normal,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .primaryText,
                                                        fontSize: 12.0,
                                                        letterSpacing: 0.0,
                                                        fontWeight:
                                                            FontWeight.normal,
                                                        fontStyle:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontStyle,
                                                      ),
                                                ),
                                              ].divide(SizedBox(height: 5.0)),
                                            ),
                                          ],
                                        ),
                                        Expanded(
                                          child: Container(
                                            height: 200.0,
                                            decoration: BoxDecoration(),
                                            child: Column(
                                              mainAxisSize: MainAxisSize.max,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment
                                                          .spaceBetween,
                                                  children: [
                                                    Expanded(
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    0.0,
                                                                    0.0,
                                                                    12.0,
                                                                    0.0),
                                                        child: Container(
                                                          width: 195.0,
                                                          height: 60.0,
                                                          decoration:
                                                              BoxDecoration(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .primaryBackground,
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                        12.0),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        30.0,
                                                                        0.0,
                                                                        0.0,
                                                                        0.0),
                                                            child: Column(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              mainAxisAlignment:
                                                                  MainAxisAlignment
                                                                      .center,
                                                              crossAxisAlignment:
                                                                  CrossAxisAlignment
                                                                      .start,
                                                              children: [
                                                                Text(
                                                                  'Total Calls',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                                FutureBuilder<
                                                                    int>(
                                                                  future:
                                                                      currentUserDocument?.company != null
                                                                          ? queryCallRecordCount(
                                                                              queryBuilder: (callRecord) =>
                                                                                  callRecord
                                                                                      .where(
                                                                                        'company',
                                                                                        isEqualTo: currentUserDocument?.company?.id,
                                                                                      )
                                                                                      .where(
                                                                                        'callType',
                                                                                        isNotEqualTo: 'transfer',
                                                                                      ),
                                                                            )
                                                                          : Future.value(0),
                                                                  builder: (context,
                                                                      snapshot) {
                                                                    // Customize what your widget looks like when it's loading.
                                                                    if (!snapshot
                                                                        .hasData) {
                                                                      return Center(
                                                                        child:
                                                                            SizedBox(
                                                                          width:
                                                                              15.0,
                                                                          height:
                                                                              15.0,
                                                                          child:
                                                                              CircularProgressIndicator(
                                                                            valueColor:
                                                                                AlwaysStoppedAnimation<Color>(
                                                                              FlutterFlowTheme.of(context).primary,
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      );
                                                                    }
                                                                    int textCount =
                                                                        snapshot
                                                                            .data!;

                                                                    return Text(
                                                                      textCount
                                                                          .toString(),
                                                                      style: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .override(
                                                                            font:
                                                                                GoogleFonts.inter(
                                                                              fontWeight: FontWeight.normal,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                            ),
                                                                            fontSize:
                                                                                13.0,
                                                                            letterSpacing:
                                                                                0.0,
                                                                            fontWeight:
                                                                                FontWeight.normal,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                    );
                                                                  },
                                                                ),
                                                              ].divide(SizedBox(
                                                                  height: 9.0)),
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ),
                                                    Expanded(
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    12.0,
                                                                    0.0,
                                                                    12.0,
                                                                    0.0),
                                                        child: Container(
                                                          width: 195.0,
                                                          height: 60.0,
                                                          decoration:
                                                              BoxDecoration(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .primaryBackground,
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                        12.0),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        30.0,
                                                                        0.0,
                                                                        0.0,
                                                                        0.0),
                                                            child: Column(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              mainAxisAlignment:
                                                                  MainAxisAlignment
                                                                      .center,
                                                              crossAxisAlignment:
                                                                  CrossAxisAlignment
                                                                      .start,
                                                              children: [
                                                                Text(
                                                                  'Completion Calls',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                                FutureBuilder<
                                                                    int>(
                                                                  future:
                                                                      currentUserDocument?.company != null
                                                                          ? queryCallRecordCount(
                                                                              queryBuilder: (callRecord) =>
                                                                                  callRecord
                                                                                      .where(
                                                                                        'company',
                                                                                        isEqualTo: currentUserDocument?.company?.id,
                                                                                      )
                                                                                      .where(
                                                                                        'success',
                                                                                        isEqualTo: true,
                                                                                      )
                                                                                      .where(
                                                                                        'callType',
                                                                                        isNotEqualTo: 'transfer',
                                                                                      ),
                                                                            )
                                                                          : Future.value(0),
                                                                  builder: (context,
                                                                      snapshot) {
                                                                    // Customize what your widget looks like when it's loading.
                                                                    if (!snapshot
                                                                        .hasData) {
                                                                      return Center(
                                                                        child:
                                                                            SizedBox(
                                                                          width:
                                                                              15.0,
                                                                          height:
                                                                              15.0,
                                                                          child:
                                                                              CircularProgressIndicator(
                                                                            valueColor:
                                                                                AlwaysStoppedAnimation<Color>(
                                                                              FlutterFlowTheme.of(context).primary,
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      );
                                                                    }
                                                                    int textCount =
                                                                        snapshot
                                                                            .data!;

                                                                    return Text(
                                                                      textCount
                                                                          .toString(),
                                                                      style: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .override(
                                                                            font:
                                                                                GoogleFonts.inter(
                                                                              fontWeight: FontWeight.normal,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                            ),
                                                                            fontSize:
                                                                                13.0,
                                                                            letterSpacing:
                                                                                0.0,
                                                                            fontWeight:
                                                                                FontWeight.normal,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                    );
                                                                  },
                                                                ),
                                                              ].divide(SizedBox(
                                                                  height: 9.0)),
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ),
                                                    Expanded(
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    12.0,
                                                                    0.0,
                                                                    12.0,
                                                                    0.0),
                                                        child: Container(
                                                          width: 195.0,
                                                          height: 60.0,
                                                          decoration:
                                                              BoxDecoration(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .primaryBackground,
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                        12.0),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        30.0,
                                                                        0.0,
                                                                        0.0,
                                                                        0.0),
                                                            child: Column(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              mainAxisAlignment:
                                                                  MainAxisAlignment
                                                                      .center,
                                                              crossAxisAlignment:
                                                                  CrossAxisAlignment
                                                                      .start,
                                                              children: [
                                                                Text(
                                                                  'Declined Calls',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                                FutureBuilder<
                                                                    int>(
                                                                  future:
                                                                      currentUserDocument?.company != null
                                                                          ? queryCallRecordCount(
                                                                              queryBuilder: (callRecord) =>
                                                                                  callRecord
                                                                                      .where(
                                                                                        'company',
                                                                                        isEqualTo: currentUserDocument?.company?.id,
                                                                                      )
                                                                                      .where(
                                                                                        'success',
                                                                                        isEqualTo: false,
                                                                                      )
                                                                                      .where(
                                                                                        'callType',
                                                                                        isNotEqualTo: 'transfer',
                                                                                      ),
                                                                            )
                                                                          : Future.value(0),
                                                                  builder: (context,
                                                                      snapshot) {
                                                                    // Customize what your widget looks like when it's loading.
                                                                    if (!snapshot
                                                                        .hasData) {
                                                                      return Center(
                                                                        child:
                                                                            SizedBox(
                                                                          width:
                                                                              15.0,
                                                                          height:
                                                                              15.0,
                                                                          child:
                                                                              CircularProgressIndicator(
                                                                            valueColor:
                                                                                AlwaysStoppedAnimation<Color>(
                                                                              FlutterFlowTheme.of(context).primary,
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      );
                                                                    }
                                                                    int textCount =
                                                                        snapshot
                                                                            .data!;

                                                                    return Text(
                                                                      textCount
                                                                          .toString(),
                                                                      style: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .override(
                                                                            font:
                                                                                GoogleFonts.inter(
                                                                              fontWeight: FontWeight.normal,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                            ),
                                                                            fontSize:
                                                                                13.0,
                                                                            letterSpacing:
                                                                                0.0,
                                                                            fontWeight:
                                                                                FontWeight.normal,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                    );
                                                                  },
                                                                ),
                                                              ].divide(SizedBox(
                                                                  height: 9.0)),
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                Expanded(
                                                  child: StreamBuilder<
                                                      List<CallRecord>>(
                                                    stream: currentUserDocument?.company != null
                                                        ? queryCallRecord(
                                                            queryBuilder:
                                                                (callRecord) =>
                                                                    callRecord
                                                                        .where(
                                                                          'company',
                                                                          isEqualTo:
                                                                              currentUserDocument
                                                                                  ?.company
                                                                                  ?.id,
                                                                        )
                                                                        .orderBy(
                                                                            'dateTime',
                                                                            descending:
                                                                                true),
                                                            limit: 10,
                                                          )
                                                        : const Stream.empty(),
                                                    builder:
                                                        (context, snapshot) {
                                                      // Customize what your widget looks like when it's loading.
                                                      if (snapshot.hasError) {
                                                        return Center(
                                                          child: Column(
                                                            mainAxisAlignment: MainAxisAlignment.center,
                                                            children: [
                                                              Icon(
                                                                Icons.error_outline,
                                                                size: 50.0,
                                                                color: FlutterFlowTheme.of(context).error,
                                                              ),
                                                              SizedBox(height: 16.0),
                                                              Text(
                                                                'Error loading call logs',
                                                                style: FlutterFlowTheme.of(context).bodyMedium,
                                                              ),
                                                              SizedBox(height: 8.0),
                                                              Text(
                                                                snapshot.error.toString(),
                                                                style: FlutterFlowTheme.of(context).bodySmall,
                                                                textAlign: TextAlign.center,
                                                              ),
                                                            ],
                                                          ),
                                                        );
                                                      }
                                                      
                                                      if (snapshot.connectionState == ConnectionState.waiting) {
                                                        return Center(
                                                          child: SizedBox(
                                                            width: 50.0,
                                                            height: 50.0,
                                                            child:
                                                                CircularProgressIndicator(
                                                              valueColor:
                                                                  AlwaysStoppedAnimation<
                                                                      Color>(
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .primary,
                                                              ),
                                                            ),
                                                          ),
                                                        );
                                                      }
                                                      
                                                      if (!snapshot.hasData || snapshot.data!.isEmpty) {
                                                        return Center(
                                                          child: Column(
                                                            mainAxisAlignment: MainAxisAlignment.center,
                                                            children: [
                                                              Icon(
                                                                Icons.phone_disabled,
                                                                size: 50.0,
                                                                color: FlutterFlowTheme.of(context).secondaryText,
                                                              ),
                                                              SizedBox(height: 16.0),
                                                              Text(
                                                                'No call logs available',
                                                                style: FlutterFlowTheme.of(context).bodyMedium,
                                                              ),
                                                              SizedBox(height: 8.0),
                                                              Text(
                                                                'Start making calls to see your call history here',
                                                                style: FlutterFlowTheme.of(context).bodySmall,
                                                                textAlign: TextAlign.center,
                                                              ),
                                                            ],
                                                          ),
                                                        );
                                                      }
                                                      List<CallRecord>
                                                          containerCallRecordList =
                                                          snapshot.data!;

                                                      return Container(
                                                        width: double.infinity,
                                                        decoration:
                                                            BoxDecoration(
                                                          color: FlutterFlowTheme
                                                                  .of(context)
                                                              .primaryBackground,
                                                          borderRadius:
                                                              BorderRadius
                                                                  .circular(
                                                                      12.0),
                                                        ),
                                                        child: Column(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          children: [
                                                            Padding(
                                                              padding:
                                                                  EdgeInsetsDirectional
                                                                      .fromSTEB(
                                                                          15.0,
                                                                          0.0,
                                                                          0.0,
                                                                          0.0),
                                                              child: Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Text(
                                                                    'Recent Calls',
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w600,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w600,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                  ),
                                                                ],
                                                              ),
                                                            ),
                                                            Expanded(
                                                              child: Padding(
                                                                padding:
                                                                    EdgeInsets
                                                                        .all(
                                                                            10.0),
                                                                child: Builder(
                                                                  builder:
                                                                      (context) {
                                                                    if (containerCallRecordList
                                                                        .isNotEmpty) {
                                                                      return Builder(
                                                                        builder:
                                                                            (context) {
                                                                          final data = containerCallRecordList
                                                                              .toList()
                                                                              .take(10)
                                                                              .toList();

                                                                          return FlutterFlowDataTable<
                                                                              CallRecord>(
                                                                            controller:
                                                                                _model.paginatedDataTableController,
                                                                            data:
                                                                                data,
                                                                            columnsBuilder: (onSortChanged) =>
                                                                                [
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'From',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'To',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'Date & Time',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'Duration',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'Call Type',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'Status',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 100.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Visibility(
                                                                                    visible: responsiveVisibility(
                                                                                      context: context,
                                                                                      desktop: false,
                                                                                    ),
                                                                                    child: Text(
                                                                                      'Cost',
                                                                                      style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.w500,
                                                                                              fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                            ),
                                                                                            color: FlutterFlowTheme.of(context).customColor7,
                                                                                            fontSize: 14.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                  ),
                                                                                ),
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'End Reasson',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 180.0,
                                                                              ),
                                                                              DataColumn2(
                                                                                label: DefaultTextStyle.merge(
                                                                                  softWrap: true,
                                                                                  child: Text(
                                                                                    'Actions',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                fixedWidth: 150.0,
                                                                              ),
                                                                            ],
                                                                            dataRowBuilder: (dataItem, dataIndex, selected, onSelectChanged) =>
                                                                                DataRow(
                                                                              color: MaterialStateProperty.all(
                                                                                dataIndex % 2 == 0 ? FlutterFlowTheme.of(context).secondaryBackground : FlutterFlowTheme.of(context).secondaryBackground,
                                                                              ),
                                                                              cells: [
                                                                                Column(
                                                                                  mainAxisSize: MainAxisSize.min,
                                                                                  mainAxisAlignment: MainAxisAlignment.center,
                                                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                                                  children: [
                                                                                    Text(
                                                                                      dataItem.fromName,
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.w500,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            color: FlutterFlowTheme.of(context).primaryText,
                                                                                            fontSize: 10.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                    Text(
                                                                                      '+${dataItem.fromNumber.toString()}',
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.normal,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            color: Color(0xFF71717A),
                                                                                            fontSize: 10.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.normal,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                  ],
                                                                                ),
                                                                                Column(
                                                                                  mainAxisSize: MainAxisSize.min,
                                                                                  mainAxisAlignment: MainAxisAlignment.center,
                                                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                                                  children: [
                                                                                    Text(
                                                                                      dataItem.toName,
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.w500,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            color: FlutterFlowTheme.of(context).primaryText,
                                                                                            fontSize: 10.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                    Text(
                                                                                      '+${dataItem.toNumber.toString()}',
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.normal,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            color: Color(0xFF71717A),
                                                                                            fontSize: 10.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.normal,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                  ],
                                                                                ),
                                                                                Row(
                                                                                  mainAxisSize: MainAxisSize.max,
                                                                                  children: [
                                                                                    Align(
                                                                                      alignment: AlignmentDirectional(0.0, 0.0),
                                                                                      child: Icon(
                                                                                        Icons.calendar_today_outlined,
                                                                                        color: FlutterFlowTheme.of(context).primary,
                                                                                        size: 14.0,
                                                                                      ),
                                                                                    ),
                                                                                    Column(
                                                                                      mainAxisSize: MainAxisSize.min,
                                                                                      mainAxisAlignment: MainAxisAlignment.center,
                                                                                      crossAxisAlignment: CrossAxisAlignment.start,
                                                                                      children: [
                                                                                        Text(
                                                                                          dateTimeFormat("relative", dataItem.dateTime!),
                                                                                          style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                                font: GoogleFonts.inter(
                                                                                                  fontWeight: FontWeight.normal,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                ),
                                                                                                color: FlutterFlowTheme.of(context).primaryText,
                                                                                                fontSize: 10.0,
                                                                                                letterSpacing: 0.0,
                                                                                                fontWeight: FontWeight.normal,
                                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                              ),
                                                                                        ),
                                                                                      ],
                                                                                    ),
                                                                                  ].divide(SizedBox(width: 5.0)),
                                                                                ),
                                                                                Row(
                                                                                  mainAxisSize: MainAxisSize.max,
                                                                                  children: [
                                                                                    Align(
                                                                                      alignment: AlignmentDirectional(0.0, 0.0),
                                                                                      child: FaIcon(
                                                                                        FontAwesomeIcons.clock,
                                                                                        color: FlutterFlowTheme.of(context).customColor1,
                                                                                        size: 14.0,
                                                                                      ),
                                                                                    ),
                                                                                    Column(
                                                                                      mainAxisSize: MainAxisSize.min,
                                                                                      mainAxisAlignment: MainAxisAlignment.center,
                                                                                      crossAxisAlignment: CrossAxisAlignment.start,
                                                                                      children: [
                                                                                        Text(
                                                                                          dataItem.duration,
                                                                                          style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                                font: GoogleFonts.inter(
                                                                                                  fontWeight: FontWeight.normal,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                ),
                                                                                                color: FlutterFlowTheme.of(context).primaryText,
                                                                                                fontSize: 10.0,
                                                                                                letterSpacing: 0.0,
                                                                                                fontWeight: FontWeight.normal,
                                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                              ),
                                                                                        ),
                                                                                      ],
                                                                                    ),
                                                                                  ].divide(SizedBox(width: 5.0)),
                                                                                ),
                                                                                Text(
                                                                                  valueOrDefault<String>(
                                                                                    dataItem.callType,
                                                                                    'incoming',
                                                                                  ),
                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                        font: GoogleFonts.inter(
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                        color: FlutterFlowTheme.of(context).primaryText,
                                                                                        fontSize: 12.0,
                                                                                        letterSpacing: 0.0,
                                                                                        fontWeight: FontWeight.w500,
                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                      ),
                                                                                ),
                                                                                Container(
                                                                                  width: 90.0,
                                                                                  height: 30.0,
                                                                                  decoration: BoxDecoration(
                                                                                    color: dataItem.success ? Color(0xFFD0F0D0) : Color(0xFFF8D7DA),
                                                                                    borderRadius: BorderRadius.circular(889.0),
                                                                                    border: Border.all(
                                                                                      color: FlutterFlowTheme.of(context).alternate,
                                                                                    ),
                                                                                  ),
                                                                                  child: Align(
                                                                                    alignment: AlignmentDirectional(0.0, 0.0),
                                                                                    child: Text(
                                                                                      dataItem.success ? 'completed' : 'declined',
                                                                                      style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.w500,
                                                                                              fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                            ),
                                                                                            color: dataItem.success ? Colors.green : Colors.red,
                                                                                            fontSize: 12.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                  ),
                                                                                ),
                                                                                Visibility(
                                                                                  visible: responsiveVisibility(
                                                                                    context: context,
                                                                                    desktop: false,
                                                                                  ),
                                                                                  child: Text(
                                                                                    '',
                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).customColor7,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                ),
                                                                                Text(
                                                                                  dataItem.endCallReason,
                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                        font: GoogleFonts.inter(
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                        ),
                                                                                        color: FlutterFlowTheme.of(context).primaryText,
                                                                                        fontSize: 12.0,
                                                                                        letterSpacing: 0.0,
                                                                                        fontWeight: FontWeight.w500,
                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                      ),
                                                                                ),
                                                                                Row(
                                                                                  mainAxisSize: MainAxisSize.max,
                                                                                  children: [
                                                                                    Builder(
                                                                                      builder: (context) => FlutterFlowIconButton(
                                                                                        borderColor: FlutterFlowTheme.of(context).primaryText,
                                                                                        borderRadius: 8.0,
                                                                                        buttonSize: 28.0,
                                                                                        hoverColor: FlutterFlowTheme.of(context).primary,
                                                                                        hoverIconColor: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                        icon: Icon(
                                                                                          Icons.play_arrow,
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          size: 12.0,
                                                                                        ),
                                                                                        onPressed: () async {
                                                                                          await showAlignedDialog(
                                                                                            context: context,
                                                                                            isGlobal: false,
                                                                                            avoidOverflow: false,
                                                                                            targetAnchor: AlignmentDirectional(-1.0, 1.0).resolve(Directionality.of(context)),
                                                                                            followerAnchor: AlignmentDirectional(0.0, 0.0).resolve(Directionality.of(context)),
                                                                                            builder: (dialogContext) {
                                                                                              return Material(
                                                                                                color: Colors.transparent,
                                                                                                child: GestureDetector(
                                                                                                  onTap: () {
                                                                                                    FocusScope.of(dialogContext).unfocus();
                                                                                                    FocusManager.instance.primaryFocus?.unfocus();
                                                                                                  },
                                                                                                  child: AudioComponentWidget(
                                                                                                    recroding: dataItem.recording,
                                                                                                  ),
                                                                                                ),
                                                                                              );
                                                                                            },
                                                                                          );
                                                                                        },
                                                                                      ),
                                                                                    ),
                                                                                    Builder(
                                                                                      builder: (context) => FlutterFlowIconButton(
                                                                                        borderColor: FlutterFlowTheme.of(context).primaryText,
                                                                                        borderRadius: 8.0,
                                                                                        buttonSize: 28.0,
                                                                                        hoverColor: FlutterFlowTheme.of(context).primary,
                                                                                        hoverIconColor: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                        icon: Icon(
                                                                                          Icons.summarize_outlined,
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          size: 12.0,
                                                                                        ),
                                                                                        onPressed: () async {
                                                                                          await showAlignedDialog(
                                                                                            context: context,
                                                                                            isGlobal: false,
                                                                                            avoidOverflow: false,
                                                                                            targetAnchor: AlignmentDirectional(-1.0, 1.0).resolve(Directionality.of(context)),
                                                                                            followerAnchor: AlignmentDirectional(0.0, 0.0).resolve(Directionality.of(context)),
                                                                                            builder: (dialogContext) {
                                                                                              return Material(
                                                                                                color: Colors.transparent,
                                                                                                child: GestureDetector(
                                                                                                  onTap: () {
                                                                                                    FocusScope.of(dialogContext).unfocus();
                                                                                                    FocusManager.instance.primaryFocus?.unfocus();
                                                                                                  },
                                                                                                  child: SummaryCompWidget(
                                                                                                    summary: dataItem.summary,
                                                                                                  ),
                                                                                                ),
                                                                                              );
                                                                                            },
                                                                                          );
                                                                                        },
                                                                                      ),
                                                                                    ),
                                                                                    Builder(
                                                                                      builder: (context) => FlutterFlowIconButton(
                                                                                        borderColor: FlutterFlowTheme.of(context).primaryText,
                                                                                        borderRadius: 8.0,
                                                                                        buttonSize: 28.0,
                                                                                        icon: FaIcon(
                                                                                          FontAwesomeIcons.fileAlt,
                                                                                          color: FlutterFlowTheme.of(context).primaryText,
                                                                                          size: 12.0,
                                                                                        ),
                                                                                        onPressed: () async {
                                                                                          await showDialog(
                                                                                            context: context,
                                                                                            builder: (dialogContext) {
                                                                                              return Dialog(
                                                                                                elevation: 0,
                                                                                                insetPadding: EdgeInsets.zero,
                                                                                                backgroundColor: Colors.transparent,
                                                                                                alignment: AlignmentDirectional(1.0, 0.0).resolve(Directionality.of(context)),
                                                                                                child: GestureDetector(
                                                                                                  onTap: () {
                                                                                                    FocusScope.of(dialogContext).unfocus();
                                                                                                    FocusManager.instance.primaryFocus?.unfocus();
                                                                                                  },
                                                                                                  child: CallDetailsWidget(
                                                                                                    callDetails: dataItem,
                                                                                                  ),
                                                                                                ),
                                                                                              );
                                                                                            },
                                                                                          );
                                                                                        },
                                                                                      ),
                                                                                    ),
                                                                                  ].divide(SizedBox(width: 15.0)),
                                                                                ),
                                                                              ].map((c) => DataCell(c)).toList(),
                                                                            ),
                                                                            paginated:
                                                                                true,
                                                                            selectable:
                                                                                false,
                                                                            hidePaginator:
                                                                                false,
                                                                            showFirstLastButtons:
                                                                                false,
                                                                            width:
                                                                                double.infinity,
                                                                            minWidth:
                                                                                5.0,
                                                                            headingRowHeight:
                                                                                50.0,
                                                                            dataRowHeight:
                                                                                60.0,
                                                                            columnSpacing:
                                                                                20.0,
                                                                            headingRowColor:
                                                                                FlutterFlowTheme.of(context).secondaryBackground,
                                                                            borderRadius:
                                                                                BorderRadius.circular(15.0),
                                                                            addHorizontalDivider:
                                                                                true,
                                                                            addTopAndBottomDivider:
                                                                                true,
                                                                            hideDefaultHorizontalDivider:
                                                                                true,
                                                                            horizontalDividerColor:
                                                                                FlutterFlowTheme.of(context).alternate,
                                                                            horizontalDividerThickness:
                                                                                1.0,
                                                                            addVerticalDivider:
                                                                                false,
                                                                          );
                                                                        },
                                                                      );
                                                                    } else {
                                                                      return Column(
                                                                        mainAxisSize:
                                                                            MainAxisSize.max,
                                                                        mainAxisAlignment:
                                                                            MainAxisAlignment.center,
                                                                        children: [
                                                                          Text(
                                                                            'No Data Available',
                                                                            style: FlutterFlowTheme.of(context).headlineMedium.override(
                                                                                  font: GoogleFonts.interTight(
                                                                                    fontWeight: FontWeight.normal,
                                                                                    fontStyle: FlutterFlowTheme.of(context).headlineMedium.fontStyle,
                                                                                  ),
                                                                                  fontSize: 14.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FontWeight.normal,
                                                                                  fontStyle: FlutterFlowTheme.of(context).headlineMedium.fontStyle,
                                                                                ),
                                                                          ),
                                                                        ],
                                                                      );
                                                                    }
                                                                  },
                                                                ),
                                                              ),
                                                            ),
                                                            Padding(
                                                              padding:
                                                                  EdgeInsetsDirectional
                                                                      .fromSTEB(
                                                                          0.0,
                                                                          0.0,
                                                                          0.0,
                                                                          18.0),
                                                              child: InkWell(
                                                                splashColor: Colors
                                                                    .transparent,
                                                                focusColor: Colors
                                                                    .transparent,
                                                                hoverColor: Colors
                                                                    .transparent,
                                                                highlightColor:
                                                                    Colors
                                                                        .transparent,
                                                                onTap:
                                                                    () async {
                                                                  context.pushNamed(
                                                                      CallLogsWidget
                                                                          .routeName);
                                                                },
                                                                child: Text(
                                                                  'View All Call Logs',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            12.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                            ),
                                                          ]
                                                              .divide(SizedBox(
                                                                  height: 10.0))
                                                              .around(SizedBox(
                                                                  height:
                                                                      10.0)),
                                                        ),
                                                      );
                                                    },
                                                  ),
                                                ),
                                              ].divide(SizedBox(height: 15.0)),
                                            ),
                                          ),
                                        ),
                                      ].divide(SizedBox(height: 15.0)),
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
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
