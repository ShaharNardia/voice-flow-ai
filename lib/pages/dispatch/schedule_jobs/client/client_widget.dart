import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_button_tabbar.dart';
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
import '/pages/extra_components/empty_list_widget/empty_list_widget_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:easy_debounce/easy_debounce.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'client_model.dart';
export 'client_model.dart';

class ClientWidget extends StatefulWidget {
  const ClientWidget({super.key});

  static String routeName = 'Client';
  static String routePath = 'client';

  @override
  State<ClientWidget> createState() => _ClientWidgetState();
}

class _ClientWidgetState extends State<ClientWidget>
    with TickerProviderStateMixin {
  late ClientModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => ClientModel());

    _model.textController1 ??= TextEditingController();
    _model.textFieldFocusNode ??= FocusNode();

    _model.tabBarController = TabController(
      vsync: this,
      length: 3,
      initialIndex: 0,
    )..addListener(() => safeSetState(() {}));

    _model.notesTextController ??=
        TextEditingController(text: _model.leadStateData?.notes);
    _model.notesFocusNode ??= FocusNode();

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
          child: Row(
            mainAxisSize: MainAxisSize.max,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              wrapWithModel(
                model: _model.navbarModel,
                updateCallback: () => safeSetState(() {}),
                updateOnChange: true,
                child: NavbarWidget(
                  pageNum: 1.9,
                ),
              ),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.max,
                  children: [
                    wrapWithModel(
                      model: _model.headerModel,
                      updateCallback: () => safeSetState(() {}),
                      child: HeaderWidget(
                        heading: 'Clients',
                        subHeading: 'Your regular clients',
                      ),
                    ),
                    Expanded(
                      child: Builder(
                        builder: (context) {
                          if (valueOrDefault<bool>(
                                  currentUserDocument?.subscribed, false) ==
                              true || currentUserDocument?.role == Role.admin) {
                            return Padding(
                              padding: EdgeInsets.all(10.0),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: FlutterFlowTheme.of(context)
                                      .secondaryBackground,
                                  borderRadius: BorderRadius.circular(0.0),
                                ),
                                child: Padding(
                                  padding: EdgeInsets.all(5.0),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.max,
                                    children: [
                                      Container(
                                        width: 300.0,
                                        decoration: BoxDecoration(),
                                        child: Padding(
                                          padding:
                                              EdgeInsetsDirectional.fromSTEB(
                                                  0.0, 15.0, 0.0, 15.0),
                                          child: Column(
                                            mainAxisSize: MainAxisSize.max,
                                            children: [
                                              Padding(
                                                padding: EdgeInsetsDirectional
                                                    .fromSTEB(
                                                        5.0, 0.0, 5.0, 0.0),
                                                child: Container(
                                                  width: 400.0,
                                                  child: TextFormField(
                                                    controller:
                                                        _model.textController1,
                                                    focusNode: _model
                                                        .textFieldFocusNode,
                                                    onChanged: (_) =>
                                                        EasyDebounce.debounce(
                                                      '_model.textController1',
                                                      Duration(
                                                          milliseconds: 200),
                                                      () => safeSetState(() {}),
                                                    ),
                                                    autofocus: false,
                                                    obscureText: false,
                                                    decoration: InputDecoration(
                                                      isDense: true,
                                                      labelStyle:
                                                          FlutterFlowTheme.of(
                                                                  context)
                                                              .labelMedium
                                                              .override(
                                                                font:
                                                                    GoogleFonts
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
                                                      hintStyle:
                                                          FlutterFlowTheme.of(
                                                                  context)
                                                              .labelMedium
                                                              .override(
                                                                font:
                                                                    GoogleFonts
                                                                        .inter(
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .normal,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .labelMedium
                                                                      .fontStyle,
                                                                ),
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .customColor7,
                                                                fontSize: 12.0,
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
                                                        borderSide: BorderSide(
                                                          color: FlutterFlowTheme
                                                                  .of(context)
                                                              .alternate,
                                                          width: 1.0,
                                                        ),
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(8.0),
                                                      ),
                                                      focusedBorder:
                                                          OutlineInputBorder(
                                                        borderSide: BorderSide(
                                                          color: FlutterFlowTheme
                                                                  .of(context)
                                                              .primary,
                                                          width: 1.0,
                                                        ),
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(8.0),
                                                      ),
                                                      errorBorder:
                                                          OutlineInputBorder(
                                                        borderSide: BorderSide(
                                                          color: FlutterFlowTheme
                                                                  .of(context)
                                                              .error,
                                                          width: 1.0,
                                                        ),
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(8.0),
                                                      ),
                                                      focusedErrorBorder:
                                                          OutlineInputBorder(
                                                        borderSide: BorderSide(
                                                          color: FlutterFlowTheme
                                                                  .of(context)
                                                              .error,
                                                          width: 1.0,
                                                        ),
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(8.0),
                                                      ),
                                                      filled: true,
                                                      fillColor: FlutterFlowTheme
                                                              .of(context)
                                                          .secondaryBackground,
                                                      contentPadding:
                                                          EdgeInsetsDirectional
                                                              .fromSTEB(
                                                                  25.0,
                                                                  15.0,
                                                                  0.0,
                                                                  15.0),
                                                    ),
                                                    style: FlutterFlowTheme.of(
                                                            context)
                                                        .bodyMedium
                                                        .override(
                                                          font:
                                                              GoogleFonts.inter(
                                                            fontWeight:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontWeight,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                          ),
                                                          letterSpacing: 0.0,
                                                          fontWeight:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontWeight,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                    cursorColor:
                                                        FlutterFlowTheme.of(
                                                                context)
                                                            .primaryText,
                                                    validator: _model
                                                        .textController1Validator
                                                        .asValidator(context),
                                                  ),
                                                ),
                                              ),
                                              if (responsiveVisibility(
                                                context: context,
                                                phone: false,
                                                tablet: false,
                                                tabletLandscape: false,
                                                desktop: false,
                                              ))
                                                Padding(
                                                  padding: EdgeInsetsDirectional
                                                      .fromSTEB(
                                                          20.0, 0.0, 20.0, 0.0),
                                                  child: Container(
                                                    width: double.infinity,
                                                    height: 42.0,
                                                    decoration: BoxDecoration(
                                                      color: FlutterFlowTheme
                                                              .of(context)
                                                          .secondaryBackground,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12.0),
                                                      border: Border.all(
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .customColor6,
                                                        width: 2.0,
                                                      ),
                                                    ),
                                                    child: Padding(
                                                      padding:
                                                          EdgeInsetsDirectional
                                                              .fromSTEB(
                                                                  12.0,
                                                                  0.0,
                                                                  0.0,
                                                                  0.0),
                                                      child: Row(
                                                        mainAxisSize:
                                                            MainAxisSize.max,
                                                        children: [
                                                          Icon(
                                                            Icons
                                                                .location_on_sharp,
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .primaryText,
                                                            size: 17.0,
                                                          ),
                                                          Expanded(
                                                            child: Padding(
                                                              padding:
                                                                  EdgeInsetsDirectional
                                                                      .fromSTEB(
                                                                          14.0,
                                                                          0.0,
                                                                          0.0,
                                                                          0.0),
                                                              child:
                                                                  FlutterFlowDropDown<
                                                                      String>(
                                                                controller: _model
                                                                        .dropDownValueController ??=
                                                                    FormFieldController<
                                                                            String>(
                                                                        null),
                                                                options: [
                                                                  'Option 1',
                                                                  'Option 2',
                                                                  'Option 3'
                                                                ],
                                                                onChanged: (val) =>
                                                                    safeSetState(() =>
                                                                        _model.dropDownValue =
                                                                            val),
                                                                width: 78.0,
                                                                height: 55.0,
                                                                searchHintTextStyle:
                                                                    FlutterFlowTheme.of(
                                                                            context)
                                                                        .labelMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).labelMedium.fontStyle,
                                                                          ),
                                                                          fontSize:
                                                                              12.0,
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .labelMedium
                                                                              .fontStyle,
                                                                        ),
                                                                searchTextStyle:
                                                                    FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.inter(
                                                                            fontWeight:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                          ),
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontWeight,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                textStyle: FlutterFlowTheme.of(
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
                                                                          FontWeight
                                                                              .w500,
                                                                      fontStyle: FlutterFlowTheme.of(
                                                                              context)
                                                                          .bodyMedium
                                                                          .fontStyle,
                                                                    ),
                                                                hintText:
                                                                    'Filter by Area',
                                                                searchHintText:
                                                                    'Search...',
                                                                icon: Icon(
                                                                  Icons
                                                                      .keyboard_arrow_down_rounded,
                                                                  color: FlutterFlowTheme.of(
                                                                          context)
                                                                      .secondaryText,
                                                                  size: 24.0,
                                                                ),
                                                                fillColor: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryBackground,
                                                                elevation: 2.0,
                                                                borderColor: Colors
                                                                    .transparent,
                                                                borderWidth:
                                                                    2.0,
                                                                borderRadius:
                                                                    12.0,
                                                                margin: EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        12.0,
                                                                        0.0,
                                                                        12.0,
                                                                        0.0),
                                                                hidesUnderline:
                                                                    true,
                                                                isOverButton:
                                                                    false,
                                                                isSearchable:
                                                                    true,
                                                                isMultiSelect:
                                                                    false,
                                                              ),
                                                            ),
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              Expanded(
                                                child: StreamBuilder<
                                                    List<LeadRecord>>(
                                                  stream: currentUserDocument?.company != null
                                                      ? queryLeadRecord(
                                                          queryBuilder:
                                                              (leadRecord) =>
                                                                  leadRecord
                                                                      .where(
                                                                        'isClient',
                                                                        isEqualTo: true,
                                                                      )
                                                                      .where(
                                                                        'company',
                                                                        isEqualTo: currentUserDocument?.company?.id,
                                                                      ),
                                                        )
                                                      : const Stream.empty(),
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
                                                    List<LeadRecord>
                                                        containerLeadRecordList =
                                                        snapshot.data!;

                                                    return Container(
                                                      decoration:
                                                          BoxDecoration(),
                                                      child: Builder(
                                                        builder: (context) {
                                                          final containerVar = (_model
                                                                              .textController1
                                                                              .text ==
                                                                          null ||
                                                                      _model.textController1
                                                                              .text ==
                                                                          ''
                                                                  ? containerLeadRecordList
                                                                  : containerLeadRecordList
                                                                      .where((e) => functions.filterSearch(
                                                                          _model
                                                                              .textController1
                                                                              .text,
                                                                          e.name)!)
                                                                      .toList())
                                                              .toList();
                                                          if (containerVar
                                                              .isEmpty) {
                                                            return EmptyListWidgetWidget();
                                                          }

                                                          return ListView
                                                              .separated(
                                                            padding:
                                                                EdgeInsets.zero,
                                                            shrinkWrap: true,
                                                            scrollDirection:
                                                                Axis.vertical,
                                                            itemCount:
                                                                containerVar
                                                                    .length,
                                                            separatorBuilder: (_,
                                                                    __) =>
                                                                SizedBox(
                                                                    height:
                                                                        20.0),
                                                            itemBuilder: (context,
                                                                containerVarIndex) {
                                                              final containerVarItem =
                                                                  containerVar[
                                                                      containerVarIndex];
                                                              return Padding(
                                                                padding:
                                                                    EdgeInsets
                                                                        .all(
                                                                            5.0),
                                                                child: InkWell(
                                                                  splashColor:
                                                                      Colors
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
                                                                    _model.leadStateData =
                                                                        containerVarItem;
                                                                    safeSetState(
                                                                        () {});
                                                                    safeSetState(
                                                                        () {
                                                                      _model.notesTextController
                                                                              ?.text =
                                                                          containerVarItem
                                                                              .notes;
                                                                    });
                                                                  },
                                                                  child:
                                                                      Container(
                                                                    width:
                                                                        280.0,
                                                                    height:
                                                                        110.0,
                                                                    decoration:
                                                                        BoxDecoration(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .primaryBackground,
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              16.0),
                                                                      border:
                                                                          Border
                                                                              .all(
                                                                        color: _model.leadStateData !=
                                                                                null
                                                                            ? FlutterFlowTheme.of(context).primary
                                                                            : Color(0x00000000),
                                                                      ),
                                                                    ),
                                                                    child:
                                                                        Padding(
                                                                      padding:
                                                                          EdgeInsets.all(
                                                                              10.0),
                                                                      child:
                                                                          Column(
                                                                        mainAxisSize:
                                                                            MainAxisSize.max,
                                                                        mainAxisAlignment:
                                                                            MainAxisAlignment.spaceEvenly,
                                                                        crossAxisAlignment:
                                                                            CrossAxisAlignment.start,
                                                                        children: [
                                                                          Row(
                                                                            mainAxisSize:
                                                                                MainAxisSize.max,
                                                                            children:
                                                                                [
                                                                              Container(
                                                                                width: 35.0,
                                                                                height: 35.0,
                                                                                decoration: BoxDecoration(
                                                                                  color: FlutterFlowTheme.of(context).accent3,
                                                                                  shape: BoxShape.circle,
                                                                                ),
                                                                                child: Align(
                                                                                  alignment: AlignmentDirectional(0.0, 0.0),
                                                                                  child: Icon(
                                                                                    Icons.person_outline_sharp,
                                                                                    color: Color(0xFF5B8BF1),
                                                                                    size: 17.0,
                                                                                  ),
                                                                                ),
                                                                              ),
                                                                              Column(
                                                                                mainAxisSize: MainAxisSize.min,
                                                                                mainAxisAlignment: MainAxisAlignment.center,
                                                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                                                children: [
                                                                                  Text(
                                                                                    containerVarItem.name,
                                                                                    style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                          fontSize: 14.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                  Text(
                                                                                    '${containerVarItem.phoneNumber}',
                                                                                    style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                          font: GoogleFonts.inter(
                                                                                            fontWeight: FontWeight.normal,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                          color: FlutterFlowTheme.of(context).customColor24,
                                                                                          fontSize: 12.0,
                                                                                          letterSpacing: 0.0,
                                                                                          fontWeight: FontWeight.normal,
                                                                                          fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                        ),
                                                                                  ),
                                                                                  if (responsiveVisibility(
                                                                                    context: context,
                                                                                    phone: false,
                                                                                    tablet: false,
                                                                                    tabletLandscape: false,
                                                                                    desktop: false,
                                                                                  ))
                                                                                    Text(
                                                                                      valueOrDefault<String>(
                                                                                        containerVarItem.email,
                                                                                        'no email',
                                                                                      ),
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.normal,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            color: FlutterFlowTheme.of(context).customColor24,
                                                                                            fontSize: 12.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.normal,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                ].divide(SizedBox(height: 5.0)),
                                                                              ),
                                                                            ].divide(SizedBox(width: 12.0)),
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
                                                                            Padding(
                                                                              padding: EdgeInsetsDirectional.fromSTEB(0.0, 4.0, 0.0, 0.0),
                                                                              child: Row(
                                                                                mainAxisSize: MainAxisSize.max,
                                                                                children: [
                                                                                  Container(
                                                                                    height: 25.0,
                                                                                    decoration: BoxDecoration(
                                                                                      color: containerVarItem.callStatus == 'contacted' ? Color(0xFFE8F9EF) : Color(0xFFF8DCDC),
                                                                                      borderRadius: BorderRadius.circular(889.0),
                                                                                      border: Border.all(
                                                                                        color: containerVarItem.callStatus == 'contacted' ? Color(0xFF166534) : Color(0xFFFF0000),
                                                                                      ),
                                                                                    ),
                                                                                    child: Align(
                                                                                      alignment: AlignmentDirectional(0.0, 0.0),
                                                                                      child: Padding(
                                                                                        padding: EdgeInsetsDirectional.fromSTEB(10.0, 0.0, 10.0, 0.0),
                                                                                        child: Text(
                                                                                          containerVarItem.callStatus,
                                                                                          style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                font: GoogleFonts.inter(
                                                                                                  fontWeight: FontWeight.normal,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                ),
                                                                                                color: containerVarItem.callStatus == 'contacted' ? Color(0xFF166534) : Color(0xFFFF0000),
                                                                                                fontSize: 12.0,
                                                                                                letterSpacing: 0.0,
                                                                                                fontWeight: FontWeight.normal,
                                                                                                fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                              ),
                                                                                        ),
                                                                                      ),
                                                                                    ),
                                                                                  ),
                                                                                ].divide(SizedBox(width: 12.0)),
                                                                              ),
                                                                            ),
                                                                        ],
                                                                      ),
                                                                    ),
                                                                  ),
                                                                ),
                                                              );
                                                            },
                                                          );
                                                        },
                                                      ),
                                                    );
                                                  },
                                                ),
                                              ),
                                            ].divide(SizedBox(height: 10.0)),
                                          ),
                                        ),
                                      ),
                                      if (_model.leadStateData != null)
                                        Padding(
                                          padding:
                                              EdgeInsetsDirectional.fromSTEB(
                                                  5.0, 0.0, 5.0, 0.0),
                                          child: Container(
                                            width: 2.0,
                                            height: double.infinity,
                                            decoration: BoxDecoration(
                                              color:
                                                  FlutterFlowTheme.of(context)
                                                      .primaryBackground,
                                            ),
                                          ),
                                        ),
                                      Expanded(
                                        child: Container(
                                          decoration: BoxDecoration(
                                            color: FlutterFlowTheme.of(context)
                                                .primaryBackground,
                                          ),
                                          child: Builder(
                                            builder: (context) {
                                              if (_model.leadStateData !=
                                                  null) {
                                                return Visibility(
                                                  visible:
                                                      _model.leadStateData !=
                                                          null,
                                                  child: Padding(
                                                    padding:
                                                        EdgeInsetsDirectional
                                                            .fromSTEB(
                                                                16.0,
                                                                40.0,
                                                                16.0,
                                                                0.0),
                                                    child: Column(
                                                      mainAxisSize:
                                                          MainAxisSize.max,
                                                      children: [
                                                        Row(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceBetween,
                                                          crossAxisAlignment:
                                                              CrossAxisAlignment
                                                                  .start,
                                                          children: [
                                                            Column(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              crossAxisAlignment:
                                                                  CrossAxisAlignment
                                                                      .start,
                                                              children: [
                                                                Text(
                                                                  valueOrDefault<
                                                                      String>(
                                                                    _model
                                                                        .leadStateData
                                                                        ?.name,
                                                                    'Name',
                                                                  ),
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .inter(
                                                                          fontWeight:
                                                                              FontWeight.w600,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            16.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.w600,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                                Row(
                                                                  mainAxisSize:
                                                                      MainAxisSize
                                                                          .max,
                                                                  children: [
                                                                    Row(
                                                                      mainAxisSize:
                                                                          MainAxisSize
                                                                              .max,
                                                                      children:
                                                                          [
                                                                        Icon(
                                                                          Icons
                                                                              .call,
                                                                          color:
                                                                              FlutterFlowTheme.of(context).customColor24,
                                                                          size:
                                                                              14.0,
                                                                        ),
                                                                        Text(
                                                                          '${_model.leadStateData?.phoneNumber}',
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .override(
                                                                                font: GoogleFonts.inter(
                                                                                  fontWeight: FontWeight.normal,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                ),
                                                                                color: FlutterFlowTheme.of(context).customColor24,
                                                                                fontSize: 12.0,
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FontWeight.normal,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                              ),
                                                                        ),
                                                                      ].divide(SizedBox(
                                                                              width: 8.0)),
                                                                    ),
                                                                    Row(
                                                                      mainAxisSize:
                                                                          MainAxisSize
                                                                              .max,
                                                                      children:
                                                                          [
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
                                                                          Icon(
                                                                            Icons.email_outlined,
                                                                            color:
                                                                                FlutterFlowTheme.of(context).customColor24,
                                                                            size:
                                                                                14.0,
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
                                                                            valueOrDefault<String>(
                                                                              _model.leadStateData?.email,
                                                                              'john@gmail.com',
                                                                            ),
                                                                            style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                  font: GoogleFonts.inter(
                                                                                    fontWeight: FontWeight.normal,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                  ),
                                                                                  color: FlutterFlowTheme.of(context).customColor24,
                                                                                  fontSize: 12.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FontWeight.normal,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                ),
                                                                          ),
                                                                      ].divide(SizedBox(
                                                                              width: 8.0)),
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
                                                                      Row(
                                                                        mainAxisSize:
                                                                            MainAxisSize.max,
                                                                        children:
                                                                            [
                                                                          Icon(
                                                                            Icons.location_on,
                                                                            color:
                                                                                FlutterFlowTheme.of(context).customColor24,
                                                                            size:
                                                                                14.0,
                                                                          ),
                                                                          Text(
                                                                            'North Side',
                                                                            style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                  font: GoogleFonts.inter(
                                                                                    fontWeight: FontWeight.normal,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                  ),
                                                                                  color: FlutterFlowTheme.of(context).customColor24,
                                                                                  fontSize: 12.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FontWeight.normal,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                ),
                                                                          ),
                                                                        ].divide(SizedBox(width: 8.0)),
                                                                      ),
                                                                  ].divide(SizedBox(
                                                                      width:
                                                                          8.0)),
                                                                ),
                                                              ].divide(SizedBox(
                                                                  height:
                                                                      12.0)),
                                                            ),
                                                          ],
                                                        ),
                                                        Expanded(
                                                          child: Column(
                                                            children: [
                                                              Align(
                                                                alignment:
                                                                    Alignment(
                                                                        0.0, 0),
                                                                child:
                                                                    FlutterFlowButtonTabBar(
                                                                  useToggleButtonStyle:
                                                                      false,
                                                                  labelStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .titleMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .interTight(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .titleMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .titleMedium
                                                                            .fontStyle,
                                                                      ),
                                                                  unselectedLabelStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .titleMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .interTight(
                                                                          fontWeight:
                                                                              FontWeight.normal,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .titleMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        fontSize:
                                                                            14.0,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight:
                                                                            FontWeight.normal,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .titleMedium
                                                                            .fontStyle,
                                                                      ),
                                                                  labelColor: FlutterFlowTheme.of(
                                                                          context)
                                                                      .primaryText,
                                                                  unselectedLabelColor:
                                                                      FlutterFlowTheme.of(
                                                                              context)
                                                                          .customColor24,
                                                                  backgroundColor:
                                                                      FlutterFlowTheme.of(
                                                                              context)
                                                                          .primary,
                                                                  borderWidth:
                                                                      2.0,
                                                                  borderRadius:
                                                                      8.0,
                                                                  elevation:
                                                                      0.0,
                                                                  labelPadding:
                                                                      EdgeInsetsDirectional.fromSTEB(
                                                                          8.0,
                                                                          0.0,
                                                                          0.0,
                                                                          0.0),
                                                                  buttonMargin:
                                                                      EdgeInsetsDirectional.fromSTEB(
                                                                          0.0,
                                                                          0.0,
                                                                          12.0,
                                                                          0.0),
                                                                  tabs: [
                                                                    Tab(
                                                                      text:
                                                                          'Overview',
                                                                    ),
                                                                    Tab(
                                                                      text:
                                                                          'Bookings',
                                                                    ),
                                                                    Tab(
                                                                      text:
                                                                          'Notes',
                                                                    ),
                                                                  ],
                                                                  controller: _model
                                                                      .tabBarController,
                                                                  onTap:
                                                                      (i) async {
                                                                    [
                                                                      () async {},
                                                                      () async {},
                                                                      () async {}
                                                                    ][i]();
                                                                  },
                                                                ),
                                                              ),
                                                              Expanded(
                                                                child:
                                                                    TabBarView(
                                                                  controller: _model
                                                                      .tabBarController,
                                                                  children: [
                                                                    Padding(
                                                                      padding: EdgeInsetsDirectional.fromSTEB(
                                                                          0.0,
                                                                          17.0,
                                                                          0.0,
                                                                          30.0),
                                                                      child:
                                                                          SingleChildScrollView(
                                                                        child:
                                                                            Column(
                                                                          mainAxisSize:
                                                                              MainAxisSize.max,
                                                                          children:
                                                                              [
                                                                            Container(
                                                                              width: double.infinity,
                                                                              height: 344.4,
                                                                              decoration: BoxDecoration(
                                                                                color: FlutterFlowTheme.of(context).primaryBackground,
                                                                                borderRadius: BorderRadius.circular(15.0),
                                                                              ),
                                                                              child: Padding(
                                                                                padding: EdgeInsets.all(30.0),
                                                                                child: Column(
                                                                                  mainAxisSize: MainAxisSize.max,
                                                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                                                  children: [
                                                                                    Text(
                                                                                      'Recent Activity',
                                                                                      style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                            font: GoogleFonts.inter(
                                                                                              fontWeight: FontWeight.w500,
                                                                                              fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                            ),
                                                                                            fontSize: 16.0,
                                                                                            letterSpacing: 0.0,
                                                                                            fontWeight: FontWeight.w500,
                                                                                            fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                          ),
                                                                                    ),
                                                                                    Align(
                                                                                      alignment: AlignmentDirectional(0.0, 0.0),
                                                                                      child: RichText(
                                                                                        textScaler: MediaQuery.of(context).textScaler,
                                                                                        text: TextSpan(
                                                                                          children: [
                                                                                            TextSpan(
                                                                                              text: 'Nothing to show here',
                                                                                              style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                                    font: GoogleFonts.inter(
                                                                                                      fontWeight: FontWeight.w500,
                                                                                                      fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                    ),
                                                                                                    color: FlutterFlowTheme.of(context).customColor24,
                                                                                                    fontSize: 12.0,
                                                                                                    letterSpacing: 0.0,
                                                                                                    fontWeight: FontWeight.w500,
                                                                                                    fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                  ),
                                                                                            )
                                                                                          ],
                                                                                          style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                                font: GoogleFonts.inter(
                                                                                                  fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                ),
                                                                                                color: FlutterFlowTheme.of(context).customColor24,
                                                                                                fontSize: 12.0,
                                                                                                letterSpacing: 0.0,
                                                                                                fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                              ),
                                                                                        ),
                                                                                      ),
                                                                                    ),
                                                                                  ].divide(SizedBox(height: 20.0)),
                                                                                ),
                                                                              ),
                                                                            ),
                                                                          ].divide(SizedBox(height: 35.0)),
                                                                        ),
                                                                      ),
                                                                    ),
                                                                    Padding(
                                                                      padding: EdgeInsetsDirectional.fromSTEB(
                                                                          0.0,
                                                                          20.0,
                                                                          0.0,
                                                                          0.0),
                                                                      child:
                                                                          Column(
                                                                        mainAxisSize:
                                                                            MainAxisSize.max,
                                                                        children: [
                                                                          Expanded(
                                                                            child:
                                                                                StreamBuilder<List<JobsRecord>>(
                                                                              stream: currentUserDocument?.company != null
                                                                                  ? queryJobsRecord(
                                                                                      queryBuilder: (jobsRecord) => jobsRecord
                                                                                          .where(
                                                                                            'leadRef',
                                                                                            isEqualTo: _model.leadStateData?.reference.id,
                                                                                          )
                                                                                          .where(
                                                                                            'company',
                                                                                            isEqualTo: currentUserDocument?.company?.id,
                                                                                          ),
                                                                                    )
                                                                                  : const Stream.empty(),
                                                                              builder: (context, snapshot) {
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
                                                                                          'Error loading jobs',
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
                                                                                      child: CircularProgressIndicator(
                                                                                        valueColor: AlwaysStoppedAnimation<Color>(
                                                                                          FlutterFlowTheme.of(context).primary,
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
                                                                                          Icons.work_outline,
                                                                                          size: 50.0,
                                                                                          color: FlutterFlowTheme.of(context).secondaryText,
                                                                                        ),
                                                                                        SizedBox(height: 16.0),
                                                                                        Text(
                                                                                          'No jobs available',
                                                                                          style: FlutterFlowTheme.of(context).bodyMedium,
                                                                                        ),
                                                                                        SizedBox(height: 8.0),
                                                                                        Text(
                                                                                          'Jobs will appear here once they are created',
                                                                                          style: FlutterFlowTheme.of(context).bodySmall,
                                                                                          textAlign: TextAlign.center,
                                                                                        ),
                                                                                      ],
                                                                                    ),
                                                                                  );
                                                                                }
                                                                                List<JobsRecord> containerJobsRecordList = snapshot.data!;

                                                                                return Container(
                                                                                  width: double.infinity,
                                                                                  height: 522.6,
                                                                                  decoration: BoxDecoration(
                                                                                    color: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                  ),
                                                                                  alignment: AlignmentDirectional(0.0, 0.0),
                                                                                  child: Padding(
                                                                                    padding: EdgeInsets.all(10.0),
                                                                                    child: Builder(
                                                                                      builder: (context) {
                                                                                        final jobs = containerJobsRecordList.toList();
                                                                                        if (jobs.isEmpty) {
                                                                                          return EmptyListWidgetWidget();
                                                                                        }

                                                                                        return FlutterFlowDataTable<JobsRecord>(
                                                                                          controller: _model.paginatedDataTableController,
                                                                                          data: jobs,
                                                                                          columnsBuilder: (onSortChanged) => [
                                                                                            DataColumn2(
                                                                                              label: DefaultTextStyle.merge(
                                                                                                softWrap: true,
                                                                                                child: Text(
                                                                                                  'Job Details',
                                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                        font: GoogleFonts.inter(
                                                                                                          fontWeight: FontWeight.normal,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                        color: FlutterFlowTheme.of(context).customColor7,
                                                                                                        fontSize: 14.0,
                                                                                                        letterSpacing: 0.0,
                                                                                                        fontWeight: FontWeight.normal,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                      ),
                                                                                                ),
                                                                                              ),
                                                                                              fixedWidth: 300.0,
                                                                                            ),
                                                                                            DataColumn2(
                                                                                              label: DefaultTextStyle.merge(
                                                                                                softWrap: true,
                                                                                                child: Text(
                                                                                                  'Schedule',
                                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                        font: GoogleFonts.inter(
                                                                                                          fontWeight: FontWeight.normal,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                        color: FlutterFlowTheme.of(context).customColor7,
                                                                                                        fontSize: 14.0,
                                                                                                        letterSpacing: 0.0,
                                                                                                        fontWeight: FontWeight.normal,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                      ),
                                                                                                ),
                                                                                              ),
                                                                                              fixedWidth: 200.0,
                                                                                            ),
                                                                                            DataColumn2(
                                                                                              label: DefaultTextStyle.merge(
                                                                                                softWrap: true,
                                                                                                child: Text(
                                                                                                  'Status',
                                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                        font: GoogleFonts.inter(
                                                                                                          fontWeight: FontWeight.normal,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                        color: FlutterFlowTheme.of(context).customColor7,
                                                                                                        fontSize: 14.0,
                                                                                                        letterSpacing: 0.0,
                                                                                                        fontWeight: FontWeight.normal,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                      ),
                                                                                                ),
                                                                                              ),
                                                                                              fixedWidth: 200.0,
                                                                                            ),
                                                                                            DataColumn2(
                                                                                              label: DefaultTextStyle.merge(
                                                                                                softWrap: true,
                                                                                                child: Text(
                                                                                                  'Priority',
                                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                        font: GoogleFonts.inter(
                                                                                                          fontWeight: FontWeight.normal,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                        color: FlutterFlowTheme.of(context).customColor7,
                                                                                                        fontSize: 14.0,
                                                                                                        letterSpacing: 0.0,
                                                                                                        fontWeight: FontWeight.normal,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                      ),
                                                                                                ),
                                                                                              ),
                                                                                              fixedWidth: 200.0,
                                                                                            ),
                                                                                            DataColumn2(
                                                                                              label: DefaultTextStyle.merge(
                                                                                                softWrap: true,
                                                                                                child: Text(
                                                                                                  'Actions',
                                                                                                  style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                        font: GoogleFonts.inter(
                                                                                                          fontWeight: FontWeight.normal,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                        color: FlutterFlowTheme.of(context).customColor7,
                                                                                                        fontSize: 14.0,
                                                                                                        letterSpacing: 0.0,
                                                                                                        fontWeight: FontWeight.normal,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                      ),
                                                                                                ),
                                                                                              ),
                                                                                              fixedWidth: 300.0,
                                                                                            ),
                                                                                          ],
                                                                                          dataRowBuilder: (jobsItem, jobsIndex, selected, onSelectChanged) => DataRow(
                                                                                            color: MaterialStateProperty.all(
                                                                                              jobsIndex % 2 == 0 ? FlutterFlowTheme.of(context).secondaryBackground : FlutterFlowTheme.of(context).secondaryBackground,
                                                                                            ),
                                                                                            cells: [
                                                                                              Column(
                                                                                                mainAxisSize: MainAxisSize.max,
                                                                                                mainAxisAlignment: MainAxisAlignment.center,
                                                                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                                                                children: [
                                                                                                  Text(
                                                                                                    jobsItem.title,
                                                                                                    textAlign: TextAlign.start,
                                                                                                    style: FlutterFlowTheme.of(context).bodyMedium.override(
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
                                                                                                  Text(
                                                                                                    jobsItem.description,
                                                                                                    textAlign: TextAlign.start,
                                                                                                    style: FlutterFlowTheme.of(context).bodyMedium.override(
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
                                                                                                ].divide(SizedBox(height: 10.0)),
                                                                                              ),
                                                                                              Row(
                                                                                                mainAxisSize: MainAxisSize.max,
                                                                                                children: [
                                                                                                  Align(
                                                                                                    alignment: AlignmentDirectional(0.0, 0.0),
                                                                                                    child: Icon(
                                                                                                      Icons.calendar_today_outlined,
                                                                                                      color: FlutterFlowTheme.of(context).customColor7,
                                                                                                      size: 16.0,
                                                                                                    ),
                                                                                                  ),
                                                                                                  Column(
                                                                                                    mainAxisSize: MainAxisSize.min,
                                                                                                    mainAxisAlignment: MainAxisAlignment.center,
                                                                                                    crossAxisAlignment: CrossAxisAlignment.start,
                                                                                                    children: [
                                                                                                      Text(
                                                                                                        dateTimeFormat("d/M h:mm a", jobsItem.requestedTime!),
                                                                                                        style: FlutterFlowTheme.of(context).bodyMedium.override(
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
                                                                                                ].divide(SizedBox(width: 12.0)),
                                                                                              ),
                                                                                              Container(
                                                                                                width: 90.0,
                                                                                                height: 30.0,
                                                                                                decoration: BoxDecoration(
                                                                                                  color: () {
                                                                                                    if (jobsItem.status == JobStatus.Completed) {
                                                                                                      return FlutterFlowTheme.of(context).customColor98;
                                                                                                    } else if (jobsItem.status == JobStatus.Inprogress) {
                                                                                                      return FlutterFlowTheme.of(context).customColor96;
                                                                                                    } else if (jobsItem.status == JobStatus.Pending) {
                                                                                                      return FlutterFlowTheme.of(context).customColor97;
                                                                                                    } else {
                                                                                                      return Color(0xFFF8DCDC);
                                                                                                    }
                                                                                                  }(),
                                                                                                  borderRadius: BorderRadius.circular(889.0),
                                                                                                  border: Border.all(
                                                                                                    color: () {
                                                                                                      if (jobsItem.status == JobStatus.Completed) {
                                                                                                        return FlutterFlowTheme.of(context).jobSucces;
                                                                                                      } else if (jobsItem.status == JobStatus.Inprogress) {
                                                                                                        return FlutterFlowTheme.of(context).customColor99;
                                                                                                      } else if (jobsItem.status == JobStatus.Pending) {
                                                                                                        return FlutterFlowTheme.of(context).customColor100;
                                                                                                      } else {
                                                                                                        return FlutterFlowTheme.of(context).error;
                                                                                                      }
                                                                                                    }(),
                                                                                                  ),
                                                                                                ),
                                                                                                child: Align(
                                                                                                  alignment: AlignmentDirectional(0.0, 0.0),
                                                                                                  child: Text(
                                                                                                    valueOrDefault<String>(
                                                                                                      jobsItem.status?.name,
                                                                                                      'progress',
                                                                                                    ),
                                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                          font: GoogleFonts.inter(
                                                                                                            fontWeight: FontWeight.w500,
                                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                          ),
                                                                                                          color: () {
                                                                                                            if (jobsItem.status == JobStatus.Completed) {
                                                                                                              return FlutterFlowTheme.of(context).jobSucces;
                                                                                                            } else if (jobsItem.status == JobStatus.Inprogress) {
                                                                                                              return FlutterFlowTheme.of(context).customColor99;
                                                                                                            } else if (jobsItem.status == JobStatus.Pending) {
                                                                                                              return FlutterFlowTheme.of(context).customColor100;
                                                                                                            } else {
                                                                                                              return FlutterFlowTheme.of(context).error;
                                                                                                            }
                                                                                                          }(),
                                                                                                          fontSize: 12.0,
                                                                                                          letterSpacing: 0.0,
                                                                                                          fontWeight: FontWeight.w500,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                  ),
                                                                                                ),
                                                                                              ),
                                                                                              Container(
                                                                                                width: 75.0,
                                                                                                height: 30.0,
                                                                                                decoration: BoxDecoration(
                                                                                                  color: () {
                                                                                                    if (jobsItem.priotity == Priorty.Low) {
                                                                                                      return Color(0xFFDAEAFE);
                                                                                                    } else if (jobsItem.priotity == Priorty.High) {
                                                                                                      return FlutterFlowTheme.of(context).customColor94;
                                                                                                    } else if (jobsItem.priotity == Priorty.Medium) {
                                                                                                      return FlutterFlowTheme.of(context).customColor97;
                                                                                                    } else if (jobsItem.priotity == Priorty.Urgent) {
                                                                                                      return Color(0xFFFEE0E0);
                                                                                                    } else {
                                                                                                      return Color(0x00000000);
                                                                                                    }
                                                                                                  }(),
                                                                                                  borderRadius: BorderRadius.circular(889.0),
                                                                                                  border: Border.all(
                                                                                                    color: FlutterFlowTheme.of(context).alternate,
                                                                                                  ),
                                                                                                ),
                                                                                                child: Align(
                                                                                                  alignment: AlignmentDirectional(0.0, 0.0),
                                                                                                  child: Text(
                                                                                                    valueOrDefault<String>(
                                                                                                      jobsItem.priotity?.name,
                                                                                                      'Low',
                                                                                                    ),
                                                                                                    style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                                          font: GoogleFonts.inter(
                                                                                                            fontWeight: FontWeight.w500,
                                                                                                            fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                          ),
                                                                                                          color: () {
                                                                                                            if (jobsItem.priotity == Priorty.Low) {
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
                                                                                                          fontSize: 12.0,
                                                                                                          letterSpacing: 0.0,
                                                                                                          fontWeight: FontWeight.w500,
                                                                                                          fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                                        ),
                                                                                                  ),
                                                                                                ),
                                                                                              ),
                                                                                              Row(
                                                                                                mainAxisSize: MainAxisSize.max,
                                                                                                children: [
                                                                                                  Builder(
                                                                                                    builder: (context) => FFButtonWidget(
                                                                                                      onPressed: () async {
                                                                                                        await showDialog(
                                                                                                          context: context,
                                                                                                          builder: (dialogContext) {
                                                                                                            return Dialog(
                                                                                                              elevation: 0,
                                                                                                              insetPadding: EdgeInsets.zero,
                                                                                                              backgroundColor: Colors.transparent,
                                                                                                              alignment: AlignmentDirectional(0.0, 0.0).resolve(Directionality.of(context)),
                                                                                                              child: GestureDetector(
                                                                                                                onTap: () {
                                                                                                                  FocusScope.of(dialogContext).unfocus();
                                                                                                                  FocusManager.instance.primaryFocus?.unfocus();
                                                                                                                },
                                                                                                                child: AssignJobWidget(
                                                                                                                  job: jobsItem,
                                                                                                                ),
                                                                                                              ),
                                                                                                            );
                                                                                                          },
                                                                                                        );
                                                                                                      },
                                                                                                      text: 'View Details',
                                                                                                      options: FFButtonOptions(
                                                                                                        height: 37.0,
                                                                                                        padding: EdgeInsetsDirectional.fromSTEB(16.0, 0.0, 16.0, 0.0),
                                                                                                        iconPadding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                                                        color: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                                        textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                                                                                                              font: GoogleFonts.interTight(
                                                                                                                fontWeight: FontWeight.w500,
                                                                                                                fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                              ),
                                                                                                              color: FlutterFlowTheme.of(context).primaryText,
                                                                                                              fontSize: 12.0,
                                                                                                              letterSpacing: 0.0,
                                                                                                              fontWeight: FontWeight.w500,
                                                                                                              fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                            ),
                                                                                                        elevation: 0.0,
                                                                                                        borderSide: BorderSide(
                                                                                                          color: FlutterFlowTheme.of(context).customColor6,
                                                                                                        ),
                                                                                                        borderRadius: BorderRadius.circular(8.0),
                                                                                                      ),
                                                                                                    ),
                                                                                                  ),
                                                                                                ].divide(SizedBox(width: 20.0)),
                                                                                              ),
                                                                                            ].map((c) => DataCell(c)).toList(),
                                                                                          ),
                                                                                          emptyBuilder: () => EmptyListWidgetWidget(),
                                                                                          paginated: true,
                                                                                          selectable: false,
                                                                                          hidePaginator: false,
                                                                                          showFirstLastButtons: false,
                                                                                          width: double.infinity,
                                                                                          minWidth: 5.0,
                                                                                          headingRowHeight: 90.0,
                                                                                          dataRowHeight: 90.0,
                                                                                          columnSpacing: 20.0,
                                                                                          headingRowColor: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                          borderRadius: BorderRadius.circular(15.0),
                                                                                          addHorizontalDivider: true,
                                                                                          addTopAndBottomDivider: true,
                                                                                          hideDefaultHorizontalDivider: true,
                                                                                          horizontalDividerColor: FlutterFlowTheme.of(context).alternate,
                                                                                          horizontalDividerThickness: 1.0,
                                                                                          addVerticalDivider: true,
                                                                                          verticalDividerColor: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                          verticalDividerThickness: 1.0,
                                                                                        );
                                                                                      },
                                                                                    ),
                                                                                  ),
                                                                                );
                                                                              },
                                                                            ),
                                                                          ),
                                                                        ],
                                                                      ),
                                                                    ),
                                                                    Column(
                                                                      mainAxisSize:
                                                                          MainAxisSize
                                                                              .max,
                                                                      children: [
                                                                        Container(
                                                                          width:
                                                                              double.infinity,
                                                                          height:
                                                                              450.0,
                                                                          decoration:
                                                                              BoxDecoration(
                                                                            color:
                                                                                FlutterFlowTheme.of(context).secondaryBackground,
                                                                            borderRadius:
                                                                                BorderRadius.circular(15.0),
                                                                          ),
                                                                          child:
                                                                              Padding(
                                                                            padding:
                                                                                EdgeInsets.all(30.0),
                                                                            child:
                                                                                Column(
                                                                              mainAxisSize: MainAxisSize.max,
                                                                              crossAxisAlignment: CrossAxisAlignment.start,
                                                                              children: [
                                                                                Text(
                                                                                  'Notes',
                                                                                  style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                        font: GoogleFonts.inter(
                                                                                          fontWeight: FontWeight.w500,
                                                                                          fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                        ),
                                                                                        fontSize: 16.0,
                                                                                        letterSpacing: 0.0,
                                                                                        fontWeight: FontWeight.w500,
                                                                                        fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                      ),
                                                                                ),
                                                                                Padding(
                                                                                  padding: EdgeInsetsDirectional.fromSTEB(0.0, 10.0, 0.0, 10.0),
                                                                                  child: Column(
                                                                                    mainAxisSize: MainAxisSize.max,
                                                                                    children: [
                                                                                      Container(
                                                                                        width: double.infinity,
                                                                                        child: TextFormField(
                                                                                          controller: _model.notesTextController,
                                                                                          focusNode: _model.notesFocusNode,
                                                                                          autofocus: false,
                                                                                          readOnly: !_model.isEditing,
                                                                                          obscureText: false,
                                                                                          decoration: InputDecoration(
                                                                                            isDense: true,
                                                                                            labelStyle: FlutterFlowTheme.of(context).labelMedium.override(
                                                                                                  font: GoogleFonts.inter(
                                                                                                    fontWeight: FlutterFlowTheme.of(context).labelMedium.fontWeight,
                                                                                                    fontStyle: FlutterFlowTheme.of(context).labelMedium.fontStyle,
                                                                                                  ),
                                                                                                  letterSpacing: 0.0,
                                                                                                  fontWeight: FlutterFlowTheme.of(context).labelMedium.fontWeight,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).labelMedium.fontStyle,
                                                                                                ),
                                                                                            hintText: 'Hey Add Your Notes Here',
                                                                                            hintStyle: FlutterFlowTheme.of(context).labelMedium.override(
                                                                                                  font: GoogleFonts.inter(
                                                                                                    fontWeight: FlutterFlowTheme.of(context).labelMedium.fontWeight,
                                                                                                    fontStyle: FlutterFlowTheme.of(context).labelMedium.fontStyle,
                                                                                                  ),
                                                                                                  letterSpacing: 0.0,
                                                                                                  fontWeight: FlutterFlowTheme.of(context).labelMedium.fontWeight,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).labelMedium.fontStyle,
                                                                                                ),
                                                                                            enabledBorder: OutlineInputBorder(
                                                                                              borderSide: BorderSide(
                                                                                                color: Color(0x00000000),
                                                                                                width: 1.0,
                                                                                              ),
                                                                                              borderRadius: BorderRadius.circular(12.0),
                                                                                            ),
                                                                                            focusedBorder: OutlineInputBorder(
                                                                                              borderSide: BorderSide(
                                                                                                color: FlutterFlowTheme.of(context).primary,
                                                                                                width: 1.0,
                                                                                              ),
                                                                                              borderRadius: BorderRadius.circular(12.0),
                                                                                            ),
                                                                                            errorBorder: OutlineInputBorder(
                                                                                              borderSide: BorderSide(
                                                                                                color: FlutterFlowTheme.of(context).error,
                                                                                                width: 1.0,
                                                                                              ),
                                                                                              borderRadius: BorderRadius.circular(12.0),
                                                                                            ),
                                                                                            focusedErrorBorder: OutlineInputBorder(
                                                                                              borderSide: BorderSide(
                                                                                                color: FlutterFlowTheme.of(context).error,
                                                                                                width: 1.0,
                                                                                              ),
                                                                                              borderRadius: BorderRadius.circular(12.0),
                                                                                            ),
                                                                                            filled: true,
                                                                                            fillColor: FlutterFlowTheme.of(context).primaryBackground,
                                                                                          ),
                                                                                          style: FlutterFlowTheme.of(context).bodyMedium.override(
                                                                                                font: GoogleFonts.inter(
                                                                                                  fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                                ),
                                                                                                fontSize: 12.0,
                                                                                                letterSpacing: 0.0,
                                                                                                fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                              ),
                                                                                          maxLines: 8,
                                                                                          minLines: 8,
                                                                                          maxLength: 200,
                                                                                          buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null,
                                                                                          cursorColor: FlutterFlowTheme.of(context).primaryText,
                                                                                          validator: _model.notesTextControllerValidator.asValidator(context),
                                                                                        ),
                                                                                      ),
                                                                                    ],
                                                                                  ),
                                                                                ),
                                                                                Builder(
                                                                                  builder: (context) {
                                                                                    if (_model.isEditing == true) {
                                                                                      return Row(
                                                                                        mainAxisSize: MainAxisSize.max,
                                                                                        mainAxisAlignment: MainAxisAlignment.end,
                                                                                        children: [
                                                                                          FFButtonWidget(
                                                                                            onPressed: () async {
                                                                                              _model.isEditing = false;
                                                                                              safeSetState(() {});
                                                                                            },
                                                                                            text: 'Cancel',
                                                                                            options: FFButtonOptions(
                                                                                              width: 100.0,
                                                                                              height: 40.0,
                                                                                              padding: EdgeInsetsDirectional.fromSTEB(16.0, 0.0, 16.0, 0.0),
                                                                                              iconPadding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                                              color: FlutterFlowTheme.of(context).primary,
                                                                                              textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                                                                                                    font: GoogleFonts.interTight(
                                                                                                      fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                      fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                    ),
                                                                                                    color: Colors.white,
                                                                                                    letterSpacing: 0.0,
                                                                                                    fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                    fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                  ),
                                                                                              elevation: 0.0,
                                                                                              borderRadius: BorderRadius.circular(8.0),
                                                                                            ),
                                                                                          ),
                                                                                          Align(
                                                                                            alignment: AlignmentDirectional(0.0, 1.0),
                                                                                            child: FFButtonWidget(
                                                                                              onPressed: () async {
                                                                                                await _model.leadStateData!.reference.update(createLeadRecordData(
                                                                                                  notes: _model.notesTextController.text,
                                                                                                ));
                                                                                                _model.isEditing = false;
                                                                                                safeSetState(() {});
                                                                                              },
                                                                                              text: 'Add',
                                                                                              options: FFButtonOptions(
                                                                                                width: 100.0,
                                                                                                height: 40.0,
                                                                                                padding: EdgeInsetsDirectional.fromSTEB(16.0, 0.0, 16.0, 0.0),
                                                                                                iconPadding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                                                color: FlutterFlowTheme.of(context).primary,
                                                                                                textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                                                                                                      font: GoogleFonts.interTight(
                                                                                                        fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                        fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                      ),
                                                                                                      color: Colors.white,
                                                                                                      letterSpacing: 0.0,
                                                                                                      fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                      fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                    ),
                                                                                                elevation: 0.0,
                                                                                                borderRadius: BorderRadius.circular(8.0),
                                                                                              ),
                                                                                            ),
                                                                                          ),
                                                                                        ].divide(SizedBox(width: 10.0)),
                                                                                      );
                                                                                    } else {
                                                                                      return Row(
                                                                                        mainAxisSize: MainAxisSize.max,
                                                                                        mainAxisAlignment: MainAxisAlignment.end,
                                                                                        children: [
                                                                                          FFButtonWidget(
                                                                                            onPressed: () async {
                                                                                              _model.isEditing = true;
                                                                                              safeSetState(() {});
                                                                                            },
                                                                                            text: 'Edit',
                                                                                            options: FFButtonOptions(
                                                                                              width: 100.0,
                                                                                              height: 40.0,
                                                                                              padding: EdgeInsetsDirectional.fromSTEB(16.0, 0.0, 16.0, 0.0),
                                                                                              iconPadding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                                              color: FlutterFlowTheme.of(context).primary,
                                                                                              textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                                                                                                    font: GoogleFonts.interTight(
                                                                                                      fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                      fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                    ),
                                                                                                    color: Colors.white,
                                                                                                    letterSpacing: 0.0,
                                                                                                    fontWeight: FlutterFlowTheme.of(context).titleSmall.fontWeight,
                                                                                                    fontStyle: FlutterFlowTheme.of(context).titleSmall.fontStyle,
                                                                                                  ),
                                                                                              elevation: 0.0,
                                                                                              borderRadius: BorderRadius.circular(8.0),
                                                                                            ),
                                                                                          ),
                                                                                        ],
                                                                                      );
                                                                                    }
                                                                                  },
                                                                                ),
                                                                              ],
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      ],
                                                                    ),
                                                                  ],
                                                                ),
                                                              ),
                                                            ],
                                                          ),
                                                        ),
                                                      ].divide(SizedBox(
                                                          height: 30.0)),
                                                    ),
                                                  ),
                                                );
                                              } else {
                                                return Column(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment.center,
                                                  children: [
                                                    ClipRRect(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                      child: SvgPicture.asset(
                                                        'assets/images/undraw_global-team_8jok.svg',
                                                        width: 400.0,
                                                        height: 250.0,
                                                        fit: BoxFit.contain,
                                                      ),
                                                    ),
                                                    Text(
                                                      '👋 Looks like you haven’t selected a Client yet!',
                                                      style: FlutterFlowTheme
                                                              .of(context)
                                                          .bodyMedium
                                                          .override(
                                                            font: GoogleFonts
                                                                .inter(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .bold,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                            ),
                                                            fontSize: 16.0,
                                                            letterSpacing: 0.0,
                                                            fontWeight:
                                                                FontWeight.bold,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                          ),
                                                    ),
                                                  ].divide(
                                                      SizedBox(height: 20.0)),
                                                );
                                              }
                                            },
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
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
      ),
    );
  }
}
