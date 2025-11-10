import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_drop_down.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/form_field_controller.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/dispatch/schedule_jobs/assign_job/assign_job_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import 'package:easy_debounce/easy_debounce.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'bookings_model.dart';
export 'bookings_model.dart';

class BookingsWidget extends StatefulWidget {
  const BookingsWidget({super.key});

  static String routeName = 'Bookings';
  static String routePath = 'apppointments';

  @override
  State<BookingsWidget> createState() => _BookingsWidgetState();
}

class _BookingsWidgetState extends State<BookingsWidget> {
  late BookingsModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => BookingsModel());

    _model.textController ??= TextEditingController();
    _model.textFieldFocusNode ??= FocusNode();

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
            children: [
              Expanded(
                child: Row(
                  mainAxisSize: MainAxisSize.max,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    wrapWithModel(
                      model: _model.navbarModel,
                      updateCallback: () => safeSetState(() {}),
                      updateOnChange: true,
                      child: NavbarWidget(
                        pageNum: 1.6,
                      ),
                    ),
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(),
                        child: Column(
                          mainAxisSize: MainAxisSize.max,
                          children: [
                            wrapWithModel(
                              model: _model.headerModel,
                              updateCallback: () => safeSetState(() {}),
                              updateOnChange: true,
                              child: HeaderWidget(
                                heading: 'Bookings',
                                subHeading: 'Manage and track service bookings',
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
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            mainAxisSize: MainAxisSize.max,
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: Padding(
                                                  padding: EdgeInsetsDirectional
                                                      .fromSTEB(
                                                          0.0, 0.0, 12.0, 0.0),
                                                  child: Container(
                                                    width: 175.0,
                                                    height: 60.0,
                                                    decoration: BoxDecoration(
                                                      color: FlutterFlowTheme
                                                              .of(context)
                                                          .primaryBackground,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              16.0),
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
                                                            MainAxisSize.max,
                                                        mainAxisAlignment:
                                                            MainAxisAlignment
                                                                .center,
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          Text(
                                                            'Active Bookings',
                                                            style: FlutterFlowTheme
                                                                    .of(context)
                                                                .bodyMedium
                                                                .override(
                                                                  font:
                                                                      GoogleFonts
                                                                          .inter(
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w500,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                                  fontSize:
                                                                      14.0,
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                                ),
                                                          ),
                                                          FutureBuilder<int>(
                                                            future:
                                                                queryJobsRecordCount(
                                                              queryBuilder:
                                                                  (jobsRecord) =>
                                                                      jobsRecord
                                                                          .where(
                                                                'company',
                                                                isEqualTo:
                                                                    currentUserDocument
                                                                        ?.company
                                                                        ?.id,
                                                              ),
                                                            ),
                                                            builder: (context,
                                                                snapshot) {
                                                              // Customize what your widget looks like when it's loading.
                                                              if (!snapshot
                                                                  .hasData) {
                                                                return Center(
                                                                  child:
                                                                      SizedBox(
                                                                    width: 15.0,
                                                                    height:
                                                                        15.0,
                                                                    child:
                                                                        CircularProgressIndicator(
                                                                      valueColor:
                                                                          AlwaysStoppedAnimation<
                                                                              Color>(
                                                                        FlutterFlowTheme.of(context)
                                                                            .primary,
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
                                                                      font: GoogleFonts
                                                                          .inter(
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                      fontSize:
                                                                          13.0,
                                                                      letterSpacing:
                                                                          0.0,
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .normal,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
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
                                                  padding: EdgeInsetsDirectional
                                                      .fromSTEB(
                                                          12.0, 0.0, 12.0, 0.0),
                                                  child: Container(
                                                    width: 195.0,
                                                    height: 60.0,
                                                    decoration: BoxDecoration(
                                                      color: FlutterFlowTheme
                                                              .of(context)
                                                          .primaryBackground,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              6.0),
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
                                                            MainAxisSize.max,
                                                        mainAxisAlignment:
                                                            MainAxisAlignment
                                                                .center,
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          Text(
                                                            'Pending Bookings',
                                                            style: FlutterFlowTheme
                                                                    .of(context)
                                                                .bodyMedium
                                                                .override(
                                                                  font:
                                                                      GoogleFonts
                                                                          .inter(
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w500,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                                  fontSize:
                                                                      14.0,
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                                ),
                                                          ),
                                                          FutureBuilder<int>(
                                                            future:
                                                                queryJobsRecordCount(
                                                              queryBuilder:
                                                                  (jobsRecord) =>
                                                                      jobsRecord
                                                                          .where(
                                                                            'company',
                                                                            isEqualTo:
                                                                                currentUserDocument?.company?.id,
                                                                          )
                                                                          .where(
                                                                            'status',
                                                                            isNotEqualTo:
                                                                                JobStatus.Completed.serialize(),
                                                                          ),
                                                            ),
                                                            builder: (context,
                                                                snapshot) {
                                                              // Customize what your widget looks like when it's loading.
                                                              if (!snapshot
                                                                  .hasData) {
                                                                return Center(
                                                                  child:
                                                                      SizedBox(
                                                                    width: 15.0,
                                                                    height:
                                                                        15.0,
                                                                    child:
                                                                        CircularProgressIndicator(
                                                                      valueColor:
                                                                          AlwaysStoppedAnimation<
                                                                              Color>(
                                                                        FlutterFlowTheme.of(context)
                                                                            .primary,
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
                                                                      font: GoogleFonts
                                                                          .inter(
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                      fontSize:
                                                                          13.0,
                                                                      letterSpacing:
                                                                          0.0,
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .normal,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
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
                                                  padding: EdgeInsetsDirectional
                                                      .fromSTEB(
                                                          12.0, 0.0, 0.0, 0.0),
                                                  child: Container(
                                                    width: 195.0,
                                                    height: 60.0,
                                                    decoration: BoxDecoration(
                                                      color: FlutterFlowTheme
                                                              .of(context)
                                                          .primaryBackground,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              6.0),
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
                                                            MainAxisSize.max,
                                                        mainAxisAlignment:
                                                            MainAxisAlignment
                                                                .center,
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          Text(
                                                            'Completed',
                                                            style: FlutterFlowTheme
                                                                    .of(context)
                                                                .bodyMedium
                                                                .override(
                                                                  font:
                                                                      GoogleFonts
                                                                          .inter(
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w500,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                                  fontSize:
                                                                      14.0,
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                                ),
                                                          ),
                                                          FutureBuilder<int>(
                                                            future:
                                                                queryJobsRecordCount(
                                                              queryBuilder:
                                                                  (jobsRecord) =>
                                                                      jobsRecord
                                                                          .where(
                                                                            'status',
                                                                            isEqualTo:
                                                                                JobStatus.Completed.serialize(),
                                                                          )
                                                                          .where(
                                                                            'company',
                                                                            isEqualTo:
                                                                                currentUserDocument?.company?.id,
                                                                          ),
                                                            ),
                                                            builder: (context,
                                                                snapshot) {
                                                              // Customize what your widget looks like when it's loading.
                                                              if (!snapshot
                                                                  .hasData) {
                                                                return Center(
                                                                  child:
                                                                      SizedBox(
                                                                    width: 15.0,
                                                                    height:
                                                                        15.0,
                                                                    child:
                                                                        CircularProgressIndicator(
                                                                      valueColor:
                                                                          AlwaysStoppedAnimation<
                                                                              Color>(
                                                                        FlutterFlowTheme.of(context)
                                                                            .primary,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                );
                                                              }
                                                              int richTextCount =
                                                                  snapshot
                                                                      .data!;

                                                              return RichText(
                                                                textScaler: MediaQuery.of(
                                                                        context)
                                                                    .textScaler,
                                                                text: TextSpan(
                                                                  children: [
                                                                    TextSpan(
                                                                      text: richTextCount
                                                                          .toString(),
                                                                      style:
                                                                          TextStyle(
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .primaryText,
                                                                        fontSize:
                                                                            13.0,
                                                                      ),
                                                                    )
                                                                  ],
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
                                                                            13.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
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
                                          Container(
                                            width: double.infinity,
                                            decoration: BoxDecoration(
                                              color:
                                                  FlutterFlowTheme.of(context)
                                                      .primaryBackground,
                                              borderRadius:
                                                  BorderRadius.circular(6.0),
                                            ),
                                            child: Padding(
                                              padding: EdgeInsetsDirectional
                                                  .fromSTEB(
                                                      20.0, 10.0, 20.0, 10.0),
                                              child: Row(
                                                mainAxisSize: MainAxisSize.max,
                                                children: [
                                                  Expanded(
                                                    child: Row(
                                                      mainAxisSize:
                                                          MainAxisSize.max,
                                                      children: [
                                                        Padding(
                                                          padding:
                                                              EdgeInsetsDirectional
                                                                  .fromSTEB(
                                                                      0.0,
                                                                      0.0,
                                                                      15.0,
                                                                      0.0),
                                                          child: Container(
                                                            width: 400.0,
                                                            child:
                                                                TextFormField(
                                                              controller: _model
                                                                  .textController,
                                                              focusNode: _model
                                                                  .textFieldFocusNode,
                                                              onChanged: (_) =>
                                                                  EasyDebounce
                                                                      .debounce(
                                                                '_model.textController',
                                                                Duration(
                                                                    milliseconds:
                                                                        200),
                                                                () =>
                                                                    safeSetState(
                                                                        () {}),
                                                              ),
                                                              autofocus: false,
                                                              obscureText:
                                                                  false,
                                                              decoration:
                                                                  InputDecoration(
                                                                isDense: true,
                                                                labelStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .labelMedium
                                                                    .override(
                                                                      font: GoogleFonts
                                                                          .inter(
                                                                        fontWeight: FlutterFlowTheme.of(context)
                                                                            .labelMedium
                                                                            .fontWeight,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelMedium
                                                                            .fontStyle,
                                                                      ),
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .primaryText,
                                                                      fontSize:
                                                                          12.0,
                                                                      letterSpacing:
                                                                          0.0,
                                                                      fontWeight: FlutterFlowTheme.of(
                                                                              context)
                                                                          .labelMedium
                                                                          .fontWeight,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .labelMedium
                                                                          .fontStyle,
                                                                    ),
                                                                hintText:
                                                                    'Search by name or phone',
                                                                hintStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .labelMedium
                                                                    .override(
                                                                      font: GoogleFonts
                                                                          .inter(
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelMedium
                                                                            .fontStyle,
                                                                      ),
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .primaryText,
                                                                      fontSize:
                                                                          12.0,
                                                                      letterSpacing:
                                                                          0.0,
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .normal,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .labelMedium
                                                                          .fontStyle,
                                                                    ),
                                                                enabledBorder:
                                                                    OutlineInputBorder(
                                                                  borderSide:
                                                                      BorderSide(
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .primaryText,
                                                                    width: 1.0,
                                                                  ),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              8.0),
                                                                ),
                                                                focusedBorder:
                                                                    OutlineInputBorder(
                                                                  borderSide:
                                                                      BorderSide(
                                                                    color: Color(
                                                                        0x00000000),
                                                                    width: 1.0,
                                                                  ),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              8.0),
                                                                ),
                                                                errorBorder:
                                                                    OutlineInputBorder(
                                                                  borderSide:
                                                                      BorderSide(
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .error,
                                                                    width: 1.0,
                                                                  ),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              8.0),
                                                                ),
                                                                focusedErrorBorder:
                                                                    OutlineInputBorder(
                                                                  borderSide:
                                                                      BorderSide(
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .error,
                                                                    width: 1.0,
                                                                  ),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              8.0),
                                                                ),
                                                                filled: true,
                                                                fillColor: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryBackground,
                                                                contentPadding:
                                                                    EdgeInsetsDirectional
                                                                        .fromSTEB(
                                                                            20.0,
                                                                            10.0,
                                                                            0.0,
                                                                            10.0),
                                                                prefixIcon:
                                                                    Icon(
                                                                  Icons.search,
                                                                  color: FlutterFlowTheme.of(
                                                                          context)
                                                                      .primaryText,
                                                                  size: 24.0,
                                                                ),
                                                              ),
                                                              style: FlutterFlowTheme
                                                                      .of(context)
                                                                  .bodyMedium
                                                                  .override(
                                                                    font: GoogleFonts
                                                                        .inter(
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .w300,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
                                                                    ),
                                                                    fontSize:
                                                                        12.0,
                                                                    letterSpacing:
                                                                        0.0,
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w300,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                              cursorColor:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .primaryText,
                                                              validator: _model
                                                                  .textControllerValidator
                                                                  .asValidator(
                                                                      context),
                                                            ),
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                  Padding(
                                                    padding:
                                                        EdgeInsetsDirectional
                                                            .fromSTEB(0.0, 0.0,
                                                                12.0, 0.0),
                                                    child: FlutterFlowDropDown<
                                                        JobStatus>(
                                                      controller: _model
                                                              .dropDownValueController ??=
                                                          FormFieldController<
                                                              JobStatus>(
                                                        _model.dropDownValue ??=
                                                            JobStatus
                                                                .Unassigned,
                                                      ),
                                                      options:
                                                          List<JobStatus>.from(
                                                              JobStatus.values),
                                                      optionLabels: JobStatus
                                                          .values
                                                          .map((e) => e.name)
                                                          .toList(),
                                                      onChanged: (val) =>
                                                          safeSetState(() =>
                                                              _model.dropDownValue =
                                                                  val),
                                                      width: 250.0,
                                                      height: 40.0,
                                                      textStyle:
                                                          FlutterFlowTheme.of(
                                                                  context)
                                                              .bodyMedium
                                                              .override(
                                                                font:
                                                                    GoogleFonts
                                                                        .inter(
                                                                  fontWeight: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontWeight,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                                ),
                                                                fontSize: 12.0,
                                                                letterSpacing:
                                                                    0.0,
                                                                fontWeight: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontWeight,
                                                                fontStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                              ),
                                                      hintText: 'Status',
                                                      icon: Icon(
                                                        Icons
                                                            .keyboard_arrow_down_rounded,
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .secondaryText,
                                                        size: 24.0,
                                                      ),
                                                      fillColor: FlutterFlowTheme
                                                              .of(context)
                                                          .secondaryBackground,
                                                      elevation: 2.0,
                                                      borderColor:
                                                          FlutterFlowTheme.of(
                                                                  context)
                                                              .customColor6,
                                                      borderWidth: 1.0,
                                                      borderRadius: 12.0,
                                                      margin:
                                                          EdgeInsetsDirectional
                                                              .fromSTEB(
                                                                  12.0,
                                                                  0.0,
                                                                  12.0,
                                                                  0.0),
                                                      hidesUnderline: true,
                                                      isOverButton: false,
                                                      isSearchable: false,
                                                      isMultiSelect: false,
                                                    ),
                                                  ),
                                                  Padding(
                                                    padding:
                                                        EdgeInsetsDirectional
                                                            .fromSTEB(12.0, 0.0,
                                                                0.0, 0.0),
                                                    child: StreamBuilder<
                                                        List<TechnicianRecord>>(
                                                      stream:
                                                          queryTechnicianRecord(
                                                        queryBuilder:
                                                            (technicianRecord) =>
                                                                technicianRecord
                                                                    .where(
                                                          'company',
                                                          isEqualTo:
                                                              currentUserDocument
                                                                  ?.company,
                                                        ),
                                                      ),
                                                      builder:
                                                          (context, snapshot) {
                                                        // Customize what your widget looks like when it's loading.
                                                        if (!snapshot.hasData) {
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
                                                        List<TechnicianRecord>
                                                            techTechnicianRecordList =
                                                            snapshot.data!;

                                                        return FlutterFlowDropDown<
                                                            String>(
                                                          controller: _model
                                                                  .techValueController ??=
                                                              FormFieldController<
                                                                  String>(null),
                                                          options: List<
                                                                  String>.from(
                                                              techTechnicianRecordList
                                                                  .map((e) => e
                                                                      .reference
                                                                      .id)
                                                                  .toList()),
                                                          optionLabels:
                                                              techTechnicianRecordList
                                                                  .map((e) =>
                                                                      e.name)
                                                                  .toList(),
                                                          onChanged: (val) =>
                                                              safeSetState(() =>
                                                                  _model.techValue =
                                                                      val),
                                                          width: 250.0,
                                                          height: 40.0,
                                                          searchHintTextStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .labelMedium
                                                                  .override(
                                                                    font: GoogleFonts
                                                                        .inter(
                                                                      fontWeight: FlutterFlowTheme.of(
                                                                              context)
                                                                          .labelMedium
                                                                          .fontWeight,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .labelMedium
                                                                          .fontStyle,
                                                                    ),
                                                                    fontSize:
                                                                        12.0,
                                                                    letterSpacing:
                                                                        0.0,
                                                                    fontWeight: FlutterFlowTheme.of(
                                                                            context)
                                                                        .labelMedium
                                                                        .fontWeight,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .labelMedium
                                                                        .fontStyle,
                                                                  ),
                                                          searchTextStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .override(
                                                                    font: GoogleFonts
                                                                        .inter(
                                                                      fontWeight: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontWeight,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
                                                                    ),
                                                                    letterSpacing:
                                                                        0.0,
                                                                    fontWeight: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontWeight,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                          textStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .override(
                                                                    font: GoogleFonts
                                                                        .inter(
                                                                      fontWeight: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontWeight,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
                                                                    ),
                                                                    fontSize:
                                                                        12.0,
                                                                    letterSpacing:
                                                                        0.0,
                                                                    fontWeight: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontWeight,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontStyle,
                                                                  ),
                                                          hintText:
                                                              'Professional',
                                                          searchHintText:
                                                              'Search...',
                                                          icon: Icon(
                                                            Icons
                                                                .keyboard_arrow_down_rounded,
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .secondaryText,
                                                            size: 24.0,
                                                          ),
                                                          fillColor: FlutterFlowTheme
                                                                  .of(context)
                                                              .secondaryBackground,
                                                          elevation: 2.0,
                                                          borderColor:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .customColor6,
                                                          borderWidth: 1.0,
                                                          borderRadius: 12.0,
                                                          margin:
                                                              EdgeInsetsDirectional
                                                                  .fromSTEB(
                                                                      12.0,
                                                                      0.0,
                                                                      12.0,
                                                                      0.0),
                                                          hidesUnderline: true,
                                                          isOverButton: false,
                                                          isSearchable: true,
                                                          isMultiSelect: false,
                                                        );
                                                      },
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                          Expanded(
                                            child:
                                                StreamBuilder<List<JobsRecord>>(
                                              stream: queryJobsRecord(
                                                queryBuilder: (jobsRecord) =>
                                                    jobsRecord.where(
                                                  'company',
                                                  isEqualTo: currentUserDocument
                                                      ?.company?.id,
                                                ),
                                              ),
                                              builder: (context, snapshot) {
                                                // Customize what your widget looks like when it's loading.
                                                if (!snapshot.hasData) {
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
                                                List<JobsRecord>
                                                    containerJobsRecordList =
                                                    snapshot.data!;

                                                return Container(
                                                  width: double.infinity,
                                                  height: 522.6,
                                                  decoration: BoxDecoration(
                                                    color: FlutterFlowTheme.of(
                                                            context)
                                                        .primaryBackground,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            15.0),
                                                  ),
                                                  alignment:
                                                      AlignmentDirectional(
                                                          0.0, 0.0),
                                                  child: Padding(
                                                    padding:
                                                        EdgeInsets.all(10.0),
                                                    child: Builder(
                                                      builder: (context) {
                                                        final jobs =
                                                            containerJobsRecordList
                                                                .where(
                                                                    (e) => () {
                                                                          if ((_model.dropDownValue != null) &&
                                                                              (_model.techValue == null || _model.techValue == '')) {
                                                                            return (e.status ==
                                                                                _model.dropDownValue);
                                                                          } else if ((_model.techValue != null && _model.techValue != '') && (_model.dropDownValue == null)) {
                                                                            return (e.technician?.id ==
                                                                                _model.techValue);
                                                                          } else if ((_model.dropDownValue != null) && (_model.techValue != null && _model.techValue != '')) {
                                                                            return ((e.status == _model.dropDownValue) &&
                                                                                (e.technician?.id == _model.techValue));
                                                                          } else {
                                                                            return (_model.textController.text == null || _model.textController.text == ''
                                                                                ? true
                                                                                : functions.jobFilter(_model.textController.text, e.userName, '')!);
                                                                          }
                                                                        }())
                                                                .toList();

                                                        return FlutterFlowDataTable<
                                                            JobsRecord>(
                                                          controller: _model
                                                              .paginatedDataTableController,
                                                          data: jobs,
                                                          columnsBuilder:
                                                              (onSortChanged) =>
                                                                  [
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Service Details',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .customColor7,
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 300.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Customer',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .customColor7,
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 200.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Schedule',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .customColor7,
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 180.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Status',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontWeight,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: Color(
                                                                            0xFF71717A),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontWeight,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 180.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Priority',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .customColor7,
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 180.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Professional',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .customColor7,
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 180.0,
                                                            ),
                                                            DataColumn2(
                                                              label:
                                                                  DefaultTextStyle
                                                                      .merge(
                                                                softWrap: true,
                                                                child: Text(
                                                                  'Actions',
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelLarge
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                        color: Color(
                                                                            0xFF71717A),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w500,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .labelLarge
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                              fixedWidth: 250.0,
                                                            ),
                                                          ],
                                                          dataRowBuilder: (jobsItem,
                                                                  jobsIndex,
                                                                  selected,
                                                                  onSelectChanged) =>
                                                              DataRow(
                                                            color:
                                                                MaterialStateProperty
                                                                    .all(
                                                              jobsIndex % 2 == 0
                                                                  ? FlutterFlowTheme.of(
                                                                          context)
                                                                      .secondaryBackground
                                                                  : FlutterFlowTheme.of(
                                                                          context)
                                                                      .secondaryBackground,
                                                            ),
                                                            cells: [
                                                              Column(
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
                                                                    jobsItem
                                                                        .title,
                                                                    textAlign:
                                                                        TextAlign
                                                                            .start,
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
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
                                                                  Text(
                                                                    jobsItem
                                                                        .description,
                                                                    textAlign:
                                                                        TextAlign
                                                                            .start,
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
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
                                                                ].divide(SizedBox(
                                                                    height:
                                                                        10.0)),
                                                              ),
                                                              Column(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .min,
                                                                mainAxisAlignment:
                                                                    MainAxisAlignment
                                                                        .center,
                                                                crossAxisAlignment:
                                                                    CrossAxisAlignment
                                                                        .start,
                                                                children: [
                                                                  Text(
                                                                    jobsItem
                                                                        .userName,
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
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
                                                                  if (responsiveVisibility(
                                                                    context:
                                                                        context,
                                                                    phone:
                                                                        false,
                                                                    tablet:
                                                                        false,
                                                                    tabletLandscape:
                                                                        false,
                                                                    desktop:
                                                                        false,
                                                                  ))
                                                                    Text(
                                                                      jobsItem
                                                                          .userEmail,
                                                                      style: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .override(
                                                                            font:
                                                                                GoogleFonts.inter(
                                                                              fontWeight: FontWeight.w500,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                            ),
                                                                            fontSize:
                                                                                12.0,
                                                                            letterSpacing:
                                                                                0.0,
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                    ),
                                                                  Text(
                                                                    valueOrDefault<
                                                                        String>(
                                                                      jobsItem
                                                                          .userPhoneNumber,
                                                                      '+8526975367',
                                                                    ),
                                                                    textAlign:
                                                                        TextAlign
                                                                            .start,
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
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
                                                                ].divide(SizedBox(
                                                                    height:
                                                                        5.0)),
                                                              ),
                                                              Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Align(
                                                                    alignment:
                                                                        AlignmentDirectional(
                                                                            0.0,
                                                                            0.0),
                                                                    child: Icon(
                                                                      Icons
                                                                          .calendar_today_outlined,
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor7,
                                                                      size:
                                                                          16.0,
                                                                    ),
                                                                  ),
                                                                  Column(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .min,
                                                                    mainAxisAlignment:
                                                                        MainAxisAlignment
                                                                            .center,
                                                                    crossAxisAlignment:
                                                                        CrossAxisAlignment
                                                                            .start,
                                                                    children: [
                                                                      Text(
                                                                        dateTimeFormat(
                                                                            "d/M h:mm a",
                                                                            jobsItem.requestedTime!),
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .override(
                                                                              font: GoogleFonts.inter(
                                                                                fontWeight: FontWeight.w500,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                              ),
                                                                              fontSize: 12.0,
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FontWeight.w500,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                            ),
                                                                      ),
                                                                    ],
                                                                  ),
                                                                ].divide(SizedBox(
                                                                    width:
                                                                        12.0)),
                                                              ),
                                                              Container(
                                                                width: 90.0,
                                                                height: 30.0,
                                                                decoration:
                                                                    BoxDecoration(
                                                                  color: () {
                                                                    if (jobsItem
                                                                            .status ==
                                                                        JobStatus
                                                                            .Completed) {
                                                                      return FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor98;
                                                                    } else if (jobsItem
                                                                            .status ==
                                                                        JobStatus
                                                                            .Inprogress) {
                                                                      return FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor96;
                                                                    } else if (jobsItem
                                                                            .status ==
                                                                        JobStatus
                                                                            .Pending) {
                                                                      return FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor97;
                                                                    } else {
                                                                      return Color(
                                                                          0xFFF6DFDF);
                                                                    }
                                                                  }(),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              889.0),
                                                                  border: Border
                                                                      .all(
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .alternate,
                                                                  ),
                                                                ),
                                                                child: Align(
                                                                  alignment:
                                                                      AlignmentDirectional(
                                                                          0.0,
                                                                          0.0),
                                                                  child: Text(
                                                                    valueOrDefault<
                                                                        String>(
                                                                      jobsItem
                                                                          .status
                                                                          ?.name,
                                                                      'progress',
                                                                    ),
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .labelLarge
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                          ),
                                                                          color:
                                                                              () {
                                                                            if (jobsItem.status ==
                                                                                JobStatus.Completed) {
                                                                              return FlutterFlowTheme.of(context).jobSucces;
                                                                            } else if (jobsItem.status == JobStatus.Inprogress) {
                                                                              return FlutterFlowTheme.of(context).customColor99;
                                                                            } else if (jobsItem.status == JobStatus.Pending) {
                                                                              return FlutterFlowTheme.of(context).customColor100;
                                                                            } else {
                                                                              return FlutterFlowTheme.of(context).customColor10;
                                                                            }
                                                                          }(),
                                                                          fontSize:
                                                                              12.0,
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                  ),
                                                                ),
                                                              ),
                                                              Container(
                                                                width: 75.0,
                                                                height: 30.0,
                                                                decoration:
                                                                    BoxDecoration(
                                                                  color: () {
                                                                    if (jobsItem
                                                                            .priotity ==
                                                                        Priorty
                                                                            .Low) {
                                                                      return Color(
                                                                          0xFFDAEAFE);
                                                                    } else if (jobsItem
                                                                            .priotity ==
                                                                        Priorty
                                                                            .High) {
                                                                      return FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor94;
                                                                    } else if (jobsItem
                                                                            .priotity ==
                                                                        Priorty
                                                                            .Medium) {
                                                                      return FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor97;
                                                                    } else if (jobsItem
                                                                            .priotity ==
                                                                        Priorty
                                                                            .Urgent) {
                                                                      return Color(
                                                                          0xFFFEE0E0);
                                                                    } else {
                                                                      return Color(
                                                                          0x00000000);
                                                                    }
                                                                  }(),
                                                                  borderRadius:
                                                                      BorderRadius
                                                                          .circular(
                                                                              889.0),
                                                                  border: Border
                                                                      .all(
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .alternate,
                                                                  ),
                                                                ),
                                                                child: Align(
                                                                  alignment:
                                                                      AlignmentDirectional(
                                                                          0.0,
                                                                          0.0),
                                                                  child: Text(
                                                                    valueOrDefault<
                                                                        String>(
                                                                      jobsItem
                                                                          .priotity
                                                                          ?.name,
                                                                      'Low',
                                                                    ),
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .labelLarge
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                          ),
                                                                          color:
                                                                              () {
                                                                            if (jobsItem.priotity ==
                                                                                Priorty.Low) {
                                                                              return Color(0xFF1E40AF);
                                                                            } else if (jobsItem.priotity == Priorty.High) {
                                                                              return Color(0xFF9A3412);
                                                                            } else if (jobsItem.priotity == Priorty.Medium) {
                                                                              return Color(0xFF854D0E);
                                                                            } else if (jobsItem.priotity == Priorty.Urgent) {
                                                                              return Color(0xFF991B1B);
                                                                            } else {
                                                                              return Color(0x00000000);
                                                                            }
                                                                          }(),
                                                                          fontSize:
                                                                              12.0,
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelLarge
                                                                              .fontStyle,
                                                                        ),
                                                                  ),
                                                                ),
                                                              ),
                                                              Text(
                                                                valueOrDefault<
                                                                    String>(
                                                                  jobsItem
                                                                      .tecnicianName,
                                                                  'Not Set',
                                                                ),
                                                                style: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .override(
                                                                      font: GoogleFonts
                                                                          .inter(
                                                                        fontWeight: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontWeight,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                      fontSize:
                                                                          12.0,
                                                                      letterSpacing:
                                                                          0.0,
                                                                      fontWeight: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontWeight,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
                                                                    ),
                                                              ),
                                                              Builder(
                                                                builder:
                                                                    (context) =>
                                                                        FFButtonWidget(
                                                                  onPressed:
                                                                      () async {
                                                                    await showDialog(
                                                                      context:
                                                                          context,
                                                                      builder:
                                                                          (dialogContext) {
                                                                        return Dialog(
                                                                          elevation:
                                                                              0,
                                                                          insetPadding:
                                                                              EdgeInsets.zero,
                                                                          backgroundColor:
                                                                              Colors.transparent,
                                                                          alignment:
                                                                              AlignmentDirectional(0.0, 0.0).resolve(Directionality.of(context)),
                                                                          child:
                                                                              GestureDetector(
                                                                            onTap:
                                                                                () {
                                                                              FocusScope.of(dialogContext).unfocus();
                                                                              FocusManager.instance.primaryFocus?.unfocus();
                                                                            },
                                                                            child:
                                                                                AssignJobWidget(
                                                                              job: jobsItem,
                                                                            ),
                                                                          ),
                                                                        );
                                                                      },
                                                                    );
                                                                  },
                                                                  text:
                                                                      'View Details',
                                                                  options:
                                                                      FFButtonOptions(
                                                                    height:
                                                                        32.0,
                                                                    padding: EdgeInsetsDirectional
                                                                        .fromSTEB(
                                                                            10.0,
                                                                            0.0,
                                                                            10.0,
                                                                            0.0),
                                                                    iconPadding:
                                                                        EdgeInsetsDirectional.fromSTEB(
                                                                            0.0,
                                                                            0.0,
                                                                            0.0,
                                                                            0.0),
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .secondaryBackground,
                                                                    textStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .titleSmall
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.interTight(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                          ),
                                                                          color:
                                                                              FlutterFlowTheme.of(context).primaryText,
                                                                          fontSize:
                                                                              8.0,
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .titleSmall
                                                                              .fontStyle,
                                                                        ),
                                                                    elevation:
                                                                        0.0,
                                                                    borderSide:
                                                                        BorderSide(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor6,
                                                                    ),
                                                                    borderRadius:
                                                                        BorderRadius.circular(
                                                                            8.0),
                                                                  ),
                                                                ),
                                                              ),
                                                            ]
                                                                .map((c) =>
                                                                    DataCell(c))
                                                                .toList(),
                                                          ),
                                                          paginated: true,
                                                          selectable: false,
                                                          hidePaginator: false,
                                                          showFirstLastButtons:
                                                              false,
                                                          width:
                                                              double.infinity,
                                                          minWidth: 5.0,
                                                          headingRowHeight:
                                                              60.0,
                                                          dataRowHeight: 80.0,
                                                          columnSpacing: 20.0,
                                                          headingRowColor:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .secondaryBackground,
                                                          borderRadius:
                                                              BorderRadius
                                                                  .circular(
                                                                      15.0),
                                                          addHorizontalDivider:
                                                              true,
                                                          addTopAndBottomDivider:
                                                              true,
                                                          hideDefaultHorizontalDivider:
                                                              true,
                                                          horizontalDividerColor:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .alternate,
                                                          horizontalDividerThickness:
                                                              0.5,
                                                          addVerticalDivider:
                                                              false,
                                                        );
                                                      },
                                                    ),
                                                  ),
                                                );
                                              },
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
                                        updateCallback: () =>
                                            safeSetState(() {}),
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
