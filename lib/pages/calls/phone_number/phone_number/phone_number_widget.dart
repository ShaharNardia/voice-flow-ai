import '/auth/firebase_auth/auth_util.dart';
import '/backend/api_requests/api_calls.dart';
import '/backend/backend.dart';
import '/backend/schema/enums/enums.dart';
import '/backend/schema/structs/index.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/calls/phone_number/edit_number/edit_number_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import '/pages/extra_components/waiting_alert/waiting_alert_widget.dart';
import 'dart:ui';
import '/flutter_flow/custom_functions.dart' as functions;
import '/index.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'phone_number_model.dart';
export 'phone_number_model.dart';

class PhoneNumberWidget extends StatefulWidget {
  const PhoneNumberWidget({super.key});

  static String routeName = 'PhoneNumber';
  static String routePath = 'phoneNumber';

  @override
  State<PhoneNumberWidget> createState() => _PhoneNumberWidgetState();
}

class _PhoneNumberWidgetState extends State<PhoneNumberWidget> {
  late PhoneNumberModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => PhoneNumberModel());

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
                        pageNum: 5.1,
                      ),
                    ),
                    Expanded(
                      child: Container(
                        width: double.infinity,
                        height: double.infinity,
                        decoration: BoxDecoration(),
                        alignment: AlignmentDirectional(0.0, 0.0),
                        child: Column(
                          mainAxisSize: MainAxisSize.max,
                          children: [
                            wrapWithModel(
                              model: _model.headerModel,
                              updateCallback: () => safeSetState(() {}),
                              updateOnChange: true,
                              child: HeaderWidget(
                                heading: 'Phone Number',
                                subHeading:
                                    'Welcome! Here You will buy your own numbers',
                              ),
                            ),
                            Expanded(
                              child: Align(
                                alignment: AlignmentDirectional(0.0, -1.0),
                                child: Builder(
                                  builder: (context) {
                                    if (valueOrDefault<bool>(
                                            currentUserDocument?.subscribed,
                                            false) ==
                                        true) {
                                      return Padding(
                                        padding: EdgeInsets.all(20.0),
                                        child: Container(
                                          width: double.infinity,
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                BorderRadius.circular(15.0),
                                          ),
                                          child: Column(
                                            mainAxisSize: MainAxisSize.max,
                                            children: [
                                              if (responsiveVisibility(
                                                context: context,
                                                phone: false,
                                                tablet: false,
                                                tabletLandscape: false,
                                                desktop: false,
                                              ))
                                                Align(
                                                  alignment:
                                                      AlignmentDirectional(
                                                          1.0, 0.0),
                                                  child: Builder(
                                                    builder: (context) =>
                                                        FFButtonWidget(
                                                      onPressed: () async {
                                                        showDialog(
                                                          barrierDismissible:
                                                              false,
                                                          context: context,
                                                          builder:
                                                              (dialogContext) {
                                                            return Dialog(
                                                              elevation: 0,
                                                              insetPadding:
                                                                  EdgeInsets
                                                                      .zero,
                                                              backgroundColor:
                                                                  Colors
                                                                      .transparent,
                                                              alignment: AlignmentDirectional(
                                                                      0.0, 0.0)
                                                                  .resolve(
                                                                      Directionality.of(
                                                                          context)),
                                                              child:
                                                                  GestureDetector(
                                                                onTap: () {
                                                                  FocusScope.of(
                                                                          dialogContext)
                                                                      .unfocus();
                                                                  FocusManager
                                                                      .instance
                                                                      .primaryFocus
                                                                      ?.unfocus();
                                                                },
                                                                child:
                                                                    WaitingAlertWidget(),
                                                              ),
                                                            );
                                                          },
                                                        );

                                                        _model.comapny =
                                                            await CompanyRecord
                                                                .getDocumentOnce(
                                                                    currentUserDocument!
                                                                        .company!);
                                                        while (
                                                            _model.codeCheck! <
                                                                1) {
                                                          _model.checkPhoneNumber =
                                                              await TwillioGroup
                                                                  .searchNumberCall
                                                                  .call(
                                                            areaCode: functions
                                                                .returnRandomAreaCode(),
                                                          );

                                                          if ((_model.checkPhoneNumber
                                                                      ?.statusCode ??
                                                                  200) ==
                                                              200) {
                                                            if (TwillioGroup
                                                                    .searchNumberCall
                                                                    .phoneNumbers(
                                                                      (_model.checkPhoneNumber
                                                                              ?.jsonBody ??
                                                                          ''),
                                                                    )!
                                                                    .length >
                                                                0) {
                                                              _model.buyvonagenumberresponse =
                                                                  await TwillioGroup
                                                                      .buyPhoneNumberCall
                                                                      .call(
                                                                phonenNumber:
                                                                    getJsonField(
                                                                  TwillioGroup
                                                                      .searchNumberCall
                                                                      .phoneNumbers(
                                                                        (_model.checkPhoneNumber?.jsonBody ??
                                                                            ''),
                                                                      )
                                                                      ?.firstOrNull,
                                                                  r'''$.phone_number''',
                                                                ).toString(),
                                                                friendlyName:
                                                                    _model
                                                                        .comapny
                                                                        ?.name,
                                                              );

                                                              if ((_model
                                                                      .buyvonagenumberresponse
                                                                      ?.succeeded ??
                                                                  true)) {
                                                                _model.vapiPhoneNumber =
                                                                    await VoiceServiceGroup
                                                                        .createPhoneNumberCall
                                                                        .call(
                                                                  number:
                                                                      getJsonField(
                                                                    TwillioGroup
                                                                        .searchNumberCall
                                                                        .phoneNumbers(
                                                                          (_model.checkPhoneNumber?.jsonBody ??
                                                                              ''),
                                                                        )
                                                                        ?.firstOrNull,
                                                                    r'''$.phone_number''',
                                                                  ).toString(),
                                                                  name: _model
                                                                      .comapny
                                                                      ?.name,
                                                                );

                                                                if ((_model.vapiPhoneNumber
                                                                            ?.statusCode ??
                                                                        200) ==
                                                                    201) {
                                                                  await currentUserDocument!
                                                                      .company!
                                                                      .update({
                                                                    ...mapToFirestore(
                                                                      {
                                                                        'companyPhoneNumbers':
                                                                            FieldValue.arrayUnion([
                                                                          VoiceServiceGroup
                                                                              .createPhoneNumberCall
                                                                              .number(
                                                                            (_model.vapiPhoneNumber?.jsonBody ??
                                                                                ''),
                                                                          )
                                                                        ]),
                                                                        'phoneNumberMap':
                                                                            FieldValue.arrayUnion([
                                                                          getPhoneNumberFirestoreData(
                                                                            updatePhoneNumberStruct(
                                                                              PhoneNumberStruct(
                                                                                id: VoiceServiceGroup.createPhoneNumberCall.id(
                                                                                  (_model.vapiPhoneNumber?.jsonBody ?? ''),
                                                                                ),
                                                                                label: Labels.inbound_outbound,
                                                                                phoneNumber: VoiceServiceGroup.createPhoneNumberCall.number(
                                                                                  (_model.vapiPhoneNumber?.jsonBody ?? ''),
                                                                                ),
                                                                              ),
                                                                              clearUnsetFields: false,
                                                                            ),
                                                                            true,
                                                                          )
                                                                        ]),
                                                                      },
                                                                    ),
                                                                  });
                                                                  _model.codeCheck =
                                                                      _model.codeCheck! +
                                                                          1;
                                                                  safeSetState(
                                                                      () {});
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }

                                                        await currentUserReference!
                                                            .update(
                                                                createUserRecordData(
                                                          profileCompleted:
                                                              true,
                                                        ));
                                                        Navigator.pop(context);

                                                        context.goNamed(
                                                            Startup7Widget
                                                                .routeName);

                                                        safeSetState(() {});
                                                      },
                                                      text: 'Add New',
                                                      options: FFButtonOptions(
                                                        width: 118.0,
                                                        height: 40.0,
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    10.0,
                                                                    0.0,
                                                                    10.0,
                                                                    0.0),
                                                        iconPadding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    0.0,
                                                                    0.0,
                                                                    0.0,
                                                                    0.0),
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .primary,
                                                        textStyle:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .titleSmall
                                                                .override(
                                                                  font: GoogleFonts
                                                                      .interTight(
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w500,
                                                                    fontStyle: FlutterFlowTheme.of(
                                                                            context)
                                                                        .titleSmall
                                                                        .fontStyle,
                                                                  ),
                                                                  color: Colors
                                                                      .white,
                                                                  fontSize:
                                                                      15.0,
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight:
                                                                      FontWeight
                                                                          .w500,
                                                                  fontStyle: FlutterFlowTheme.of(
                                                                          context)
                                                                      .titleSmall
                                                                      .fontStyle,
                                                                ),
                                                        elevation: 2.0,
                                                        borderSide: BorderSide(
                                                          color: Colors
                                                              .transparent,
                                                          width: 1.0,
                                                        ),
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12.0),
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              Expanded(
                                                child: Container(
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
                                                    child: StreamBuilder<
                                                        CompanyRecord>(
                                                      stream: CompanyRecord
                                                          .getDocument(
                                                              currentUserDocument!
                                                                  .company!),
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

                                                        final conditionalBuilderCompanyRecord =
                                                            snapshot.data!;

                                                        return Builder(
                                                          builder: (context) {
                                                            if (conditionalBuilderCompanyRecord
                                                                .phoneNumberMap
                                                                .isNotEmpty) {
                                                              return Builder(
                                                                builder:
                                                                    (context) {
                                                                  final phone =
                                                                      conditionalBuilderCompanyRecord
                                                                          .phoneNumberMap
                                                                          .toList();

                                                                  return FlutterFlowDataTable<
                                                                      PhoneNumberStruct>(
                                                                    controller:
                                                                        _model
                                                                            .paginatedDataTableController,
                                                                    data: phone,
                                                                    columnsBuilder:
                                                                        (onSortChanged) =>
                                                                            [
                                                                      DataColumn2(
                                                                        label: DefaultTextStyle
                                                                            .merge(
                                                                          softWrap:
                                                                              true,
                                                                          child:
                                                                              Text(
                                                                            'Number',
                                                                            style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                  font: GoogleFonts.inter(
                                                                                    fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                    fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                  ),
                                                                                  fontSize: 12.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                  fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                ),
                                                                          ),
                                                                        ),
                                                                      ),
                                                                      DataColumn2(
                                                                        label: DefaultTextStyle
                                                                            .merge(
                                                                          softWrap:
                                                                              true,
                                                                          child:
                                                                              Text(
                                                                            'Forwarding Number',
                                                                            style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                  font: GoogleFonts.inter(
                                                                                    fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                    fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                  ),
                                                                                  fontSize: 12.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                  fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                ),
                                                                          ),
                                                                        ),
                                                                      ),
                                                                      DataColumn2(
                                                                        label: DefaultTextStyle
                                                                            .merge(
                                                                          softWrap:
                                                                              true,
                                                                          child:
                                                                              Text(
                                                                            'Actions',
                                                                            style: FlutterFlowTheme.of(context).labelLarge.override(
                                                                                  font: GoogleFonts.inter(
                                                                                    fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                    fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                  ),
                                                                                  fontSize: 12.0,
                                                                                  letterSpacing: 0.0,
                                                                                  fontWeight: FlutterFlowTheme.of(context).labelLarge.fontWeight,
                                                                                  fontStyle: FlutterFlowTheme.of(context).labelLarge.fontStyle,
                                                                                ),
                                                                          ),
                                                                        ),
                                                                      ),
                                                                    ],
                                                                    dataRowBuilder: (phoneItem,
                                                                            phoneIndex,
                                                                            selected,
                                                                            onSelectChanged) =>
                                                                        DataRow(
                                                                      color: MaterialStateProperty
                                                                          .all(
                                                                        phoneIndex % 2 ==
                                                                                0
                                                                            ? FlutterFlowTheme.of(context).secondaryBackground
                                                                            : FlutterFlowTheme.of(context).secondaryBackground,
                                                                      ),
                                                                      cells: [
                                                                        Text(
                                                                          phoneItem
                                                                              .phoneNumber,
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .override(
                                                                                font: GoogleFonts.inter(
                                                                                  fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                ),
                                                                                fontSize: 10.0,
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                              ),
                                                                        ),
                                                                        Text(
                                                                          valueOrDefault<
                                                                              String>(
                                                                            phoneItem.forwardingNumber,
                                                                            'Unset',
                                                                          ),
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .override(
                                                                                font: GoogleFonts.inter(
                                                                                  fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                                ),
                                                                                fontSize: 10.0,
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FlutterFlowTheme.of(context).bodyMedium.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyMedium.fontStyle,
                                                                              ),
                                                                        ),
                                                                        Row(
                                                                          mainAxisSize:
                                                                              MainAxisSize.min,
                                                                          crossAxisAlignment:
                                                                              CrossAxisAlignment.start,
                                                                          children:
                                                                              [
                                                                            if (responsiveVisibility(
                                                                              context: context,
                                                                              phone: false,
                                                                              tablet: false,
                                                                              tabletLandscape: false,
                                                                              desktop: false,
                                                                            ))
                                                                              Builder(
                                                                                builder: (context) => FlutterFlowIconButton(
                                                                                  borderColor: Colors.transparent,
                                                                                  borderRadius: 15.0,
                                                                                  borderWidth: 1.0,
                                                                                  buttonSize: 40.0,
                                                                                  icon: Icon(
                                                                                    Icons.edit,
                                                                                    color: FlutterFlowTheme.of(context).primaryText,
                                                                                    size: 16.0,
                                                                                  ),
                                                                                  showLoadingIndicator: true,
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
                                                                                            child: EditNumberWidget(
                                                                                              phonenumber: phoneItem,
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
                                                                                borderColor: Colors.transparent,
                                                                                borderRadius: 15.0,
                                                                                borderWidth: 1.0,
                                                                                buttonSize: 40.0,
                                                                                icon: Icon(
                                                                                  Icons.edit,
                                                                                  color: FlutterFlowTheme.of(context).primaryText,
                                                                                  size: 16.0,
                                                                                ),
                                                                                showLoadingIndicator: true,
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
                                                                                          child: EditNumberWidget(
                                                                                            phonenumber: phoneItem,
                                                                                          ),
                                                                                        ),
                                                                                      );
                                                                                    },
                                                                                  );
                                                                                },
                                                                              ),
                                                                            ),
                                                                            FlutterFlowIconButton(
                                                                              borderColor: Colors.transparent,
                                                                              borderRadius: 15.0,
                                                                              borderWidth: 1.0,
                                                                              buttonSize: 40.0,
                                                                              icon: FaIcon(
                                                                                FontAwesomeIcons.trashAlt,
                                                                                color: FlutterFlowTheme.of(context).error,
                                                                                size: 16.0,
                                                                              ),
                                                                              showLoadingIndicator: true,
                                                                              onPressed: () async {
                                                                                _model.apiResult7or = await VoiceServiceGroup.deletePhoneCall.call(
                                                                                  id: phoneItem.id,
                                                                                );

                                                                                if (_model.apiResult7or?.succeeded == true) {
                                                                                  await currentUserDocument!.company!.update({
                                                                                    ...mapToFirestore(
                                                                                      {
                                                                                        'companyPhoneNumbers': FieldValue.arrayRemove([
                                                                                          phoneItem.phoneNumber
                                                                                        ]),
                                                                                        'phoneNumberMap': FieldValue.arrayRemove([
                                                                                          getPhoneNumberFirestoreData(
                                                                                            updatePhoneNumberStruct(
                                                                                              phoneItem,
                                                                                              clearUnsetFields: false,
                                                                                            ),
                                                                                            true,
                                                                                          )
                                                                                        ]),
                                                                                      },
                                                                                    ),
                                                                                  });
                                                                                  ScaffoldMessenger.of(context).showSnackBar(
                                                                                    SnackBar(
                                                                                      content: Text(
                                                                                        'Phone Number deleted successfully',
                                                                                        style: TextStyle(
                                                                                          color: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                        ),
                                                                                      ),
                                                                                      duration: Duration(milliseconds: 4000),
                                                                                      backgroundColor: Color(0xFF45A671),
                                                                                    ),
                                                                                  );
                                                                                } else {
                                                                                  ScaffoldMessenger.of(context).showSnackBar(
                                                                                    SnackBar(
                                                                                      content: Text(
                                                                                        _model.apiResult7or?.bodyText ?? 
                                                                                        'Failed to delete phone number. Please try again.',
                                                                                        style: TextStyle(
                                                                                          color: FlutterFlowTheme.of(context).secondaryBackground,
                                                                                        ),
                                                                                      ),
                                                                                      duration: Duration(milliseconds: 4000),
                                                                                      backgroundColor: Color(0xFFBB6E7B),
                                                                                    ),
                                                                                  );
                                                                                }

                                                                                safeSetState(() {});
                                                                              },
                                                                            ),
                                                                          ].divide(SizedBox(width: 10.0)),
                                                                        ),
                                                                      ]
                                                                          .map((c) =>
                                                                              DataCell(c))
                                                                          .toList(),
                                                                    ),
                                                                    paginated:
                                                                        true,
                                                                    selectable:
                                                                        false,
                                                                    hidePaginator:
                                                                        false,
                                                                    showFirstLastButtons:
                                                                        false,
                                                                    headingRowHeight:
                                                                        56.0,
                                                                    dataRowHeight:
                                                                        60.0,
                                                                    columnSpacing:
                                                                        20.0,
                                                                    headingRowColor:
                                                                        FlutterFlowTheme.of(context)
                                                                            .secondaryBackground,
                                                                    borderRadius:
                                                                        BorderRadius.circular(
                                                                            8.0),
                                                                    addHorizontalDivider:
                                                                        true,
                                                                    addTopAndBottomDivider:
                                                                        true,
                                                                    hideDefaultHorizontalDivider:
                                                                        true,
                                                                    horizontalDividerColor:
                                                                        FlutterFlowTheme.of(context)
                                                                            .alternate,
                                                                    horizontalDividerThickness:
                                                                        0.5,
                                                                    addVerticalDivider:
                                                                        false,
                                                                  );
                                                                },
                                                              );
                                                            } else {
                                                              return Column(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                mainAxisAlignment:
                                                                    MainAxisAlignment
                                                                        .center,
                                                                children: [
                                                                  Text(
                                                                    'No Phone Number\nAvailable',
                                                                    textAlign:
                                                                        TextAlign
                                                                            .center,
                                                                    style: FlutterFlowTheme.of(
                                                                            context)
                                                                        .headlineMedium
                                                                        .override(
                                                                          font:
                                                                              GoogleFonts.interTight(
                                                                            fontWeight:
                                                                                FontWeight.w500,
                                                                            fontStyle:
                                                                                FlutterFlowTheme.of(context).headlineMedium.fontStyle,
                                                                          ),
                                                                          fontSize:
                                                                              16.0,
                                                                          letterSpacing:
                                                                              0.0,
                                                                          fontWeight:
                                                                              FontWeight.w500,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .headlineMedium
                                                                              .fontStyle,
                                                                        ),
                                                                  ),
                                                                  SizedBox(height: 20.0),
                                                                  FFButtonWidget(
                                                                    onPressed: () async {
                                                                      showDialog(
                                                                        barrierDismissible:
                                                                            false,
                                                                        context: context,
                                                                        builder:
                                                                            (dialogContext) {
                                                                          return Dialog(
                                                                            elevation: 0,
                                                                            insetPadding:
                                                                                EdgeInsets
                                                                                    .zero,
                                                                            backgroundColor:
                                                                                Colors
                                                                                    .transparent,
                                                                            alignment: AlignmentDirectional(
                                                                                    0.0, 0.0)
                                                                                .resolve(
                                                                                    Directionality.of(
                                                                                        context)),
                                                                            child:
                                                                                GestureDetector(
                                                                              onTap: () {
                                                                                FocusScope.of(
                                                                                        dialogContext)
                                                                                    .unfocus();
                                                                                FocusManager
                                                                                    .instance
                                                                                    .primaryFocus
                                                                                    ?.unfocus();
                                                                              },
                                                                              child:
                                                                                  WaitingAlertWidget(),
                                                                            ),
                                                                          );
                                                                        },
                                                                      );

                                                                      _model.comapny =
                                                                          await CompanyRecord
                                                                              .getDocumentOnce(
                                                                                  currentUserDocument!
                                                                                      .company!);
                                                                      while (
                                                                          _model.codeCheck! <
                                                                              1) {
                                                                        _model.checkPhoneNumber =
                                                                            await TwillioGroup
                                                                                .searchNumberCall
                                                                                .call(
                                                                          areaCode: functions
                                                                              .returnRandomAreaCode(),
                                                                        );

                                                                        if ((_model.checkPhoneNumber
                                                                                    ?.statusCode ??
                                                                                200) ==
                                                                            200) {
                                                                          if (TwillioGroup
                                                                                  .searchNumberCall
                                                                                  .phoneNumbers(
                                                                                    (_model.checkPhoneNumber
                                                                                            ?.jsonBody ??
                                                                                        ''),
                                                                                  )!
                                                                                  .length >
                                                                              0) {
                                                                            _model.buyvonagenumberresponse =
                                                                                await TwillioGroup
                                                                                    .buyPhoneNumberCall
                                                                                    .call(
                                                                              phonenNumber:
                                                                                  getJsonField(
                                                                                TwillioGroup
                                                                                    .searchNumberCall
                                                                                    .phoneNumbers(
                                                                                      (_model.checkPhoneNumber?.jsonBody ??
                                                                                          ''),
                                                                                    )
                                                                                    ?.firstOrNull,
                                                                                r'''$.phone_number''',
                                                                              ).toString(),
                                                                              friendlyName:
                                                                                  _model
                                                                                      .comapny
                                                                                      ?.name,
                                                                            );

                                                                            if ((_model
                                                                                    .buyvonagenumberresponse
                                                                                    ?.succeeded ??
                                                                                true)) {
                                                                              _model.vapiPhoneNumber =
                                                                                  await VoiceServiceGroup
                                                                                      .createPhoneNumberCall
                                                                                      .call(
                                                                                number:
                                                                                    getJsonField(
                                                                                  TwillioGroup
                                                                                      .searchNumberCall
                                                                                      .phoneNumbers(
                                                                                        (_model.checkPhoneNumber?.jsonBody ??
                                                                                            ''),
                                                                                      )
                                                                                      ?.firstOrNull,
                                                                                  r'''$.phone_number''',
                                                                                ).toString(),
                                                                                name: _model
                                                                                    .comapny
                                                                                    ?.name,
                                                                              );

                                                                              if (_model.vapiPhoneNumber?.succeeded == true) {
                                                                                await currentUserDocument!.company!.update({
                                                                                  ...mapToFirestore(
                                                                                    {
                                                                                      'companyPhoneNumbers': FieldValue.arrayUnion([
                                                                                        VoiceServiceGroup.createPhoneNumberCall.number(
                                                                                          (_model.vapiPhoneNumber?.jsonBody ?? ''),
                                                                                        )
                                                                                      ]),
                                                                                      'phoneNumberMap': FieldValue.arrayUnion([
                                                                                        getPhoneNumberFirestoreData(
                                                                                          updatePhoneNumberStruct(
                                                                                            PhoneNumberStruct(
                                                                                              id: VoiceServiceGroup.createPhoneNumberCall
                                                                                                  .id(
                                                                                                (_model.vapiPhoneNumber?.jsonBody ?? ''),
                                                                                              ),
                                                                                              phoneNumber: VoiceServiceGroup.createPhoneNumberCall
                                                                                                  .number(
                                                                                                (_model.vapiPhoneNumber?.jsonBody ?? ''),
                                                                                              ),
                                                                                              assistant: '',
                                                                                              forwardingNumber: '',
                                                                                              label: Labels.inbound_outbound,
                                                                                              primary: true,
                                                                                            ),
                                                                                          ),
                                                                                        ),
                                                                                      ]),
                                                                                    },
                                                                                  ),
                                                                                });

                                                                                Navigator.pop(context);
                                                                                ScaffoldMessenger.of(context).showSnackBar(
                                                                                  SnackBar(
                                                                                    content: Text(
                                                                                      'Phone number purchased successfully!',
                                                                                    ),
                                                                                    duration: Duration(milliseconds: 4000),
                                                                                    backgroundColor: Color(0xFF4CAF50),
                                                                                  ),
                                                                                );
                                                                              } else {
                                                                                ScaffoldMessenger.of(context).showSnackBar(
                                                                                  SnackBar(
                                                                                    content: Text(
                                                                                      _model.vapiPhoneNumber?.bodyText ?? 
                                                                                      'Failed to purchase phone number. Please try again.',
                                                                                    ),
                                                                                    duration: Duration(milliseconds: 4000),
                                                                                    backgroundColor: Color(0xFFBB6E7B),
                                                                                  ),
                                                                                );
                                                                              }
                                                                            }
                                                                          }
                                                                        }

                                                                        _model.codeCheck = _model.codeCheck! + 1;
                                                                      }

                                                                      _model.codeCheck = 0;
                                                                      safeSetState(() {});
                                                                    },
                                                                    text: 'Buy Phone Number',
                                                                    options: FFButtonOptions(
                                                                      width: 200.0,
                                                                      height: 50.0,
                                                                      padding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                      iconPadding: EdgeInsetsDirectional.fromSTEB(0.0, 0.0, 0.0, 0.0),
                                                                      color: Color(0xFF4CAF50),
                                                                      textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                                                                            fontFamily: 'Inter Tight',
                                                                            color: Colors.white,
                                                                            fontSize: 16.0,
                                                                            letterSpacing: 0.0,
                                                                            fontWeight: FontWeight.w600,
                                                                          ),
                                                                      elevation: 3.0,
                                                                      borderSide: BorderSide(
                                                                        color: Colors.transparent,
                                                                        width: 1.0,
                                                                      ),
                                                                      borderRadius: BorderRadius.circular(12.0),
                                                                    ),
                                                                  ),
                                                                ],
                                                              );
                                                            }
                                                          },
                                                        );
                                                      },
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ].divide(SizedBox(height: 15.0)),
                                          ),
                                        ),
                                      );
                                    } else {
                                      return Align(
                                        alignment:
                                            AlignmentDirectional(0.0, 0.0),
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
