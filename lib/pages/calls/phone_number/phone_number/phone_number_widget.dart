import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/backend/workflows/workflow_service.dart';
import '/flutter_flow/flutter_flow_data_table.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/pages/billing/subscribe/subscribe_widget.dart';
import '/pages/calls/phone_number/edit_number/edit_number_widget.dart';
import '/pages/components/header/header_widget.dart';
import '/pages/components/navbar/navbar_widget.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
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
            children: [
              Expanded(
                child: Row(
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
                      child: Column(
                        children: [
                          wrapWithModel(
                            model: _model.headerModel,
                            updateCallback: () => safeSetState(() {}),
                            updateOnChange: true,
                            child: HeaderWidget(
                              heading: 'Phone Number',
                              subHeading:
                                  'Search, provision, and manage your company numbers',
                            ),
                          ),
                          Expanded(
                            child: AuthUserStreamWidget(
                              builder: (context) {
                                final subscribed = valueOrDefault<bool>(
                                  currentUserDocument?.subscribed,
                                  false,
                                );
                                final isAdmin = currentUserDocument?.role == Role.admin;
                                if (!subscribed && !isAdmin) {
                                  return wrapWithModel(
                                    model: _model.subscribeModel,
                                    updateCallback: () => safeSetState(() {}),
                                    updateOnChange: true,
                                    child: SubscribeWidget(),
                                  );
                                }

                                final companyRef =
                                    currentUserDocument?.company;
                                if (companyRef == null) {
                                  return Center(
                                    child: Padding(
                                      padding: const EdgeInsets.all(24.0),
                                      child: Text(
                                        'Assign this user to a company to manage phone numbers.',
                                        textAlign: TextAlign.center,
                                        style: FlutterFlowTheme.of(context)
                                            .labelLarge
                                            .override(
                                              font: GoogleFonts.interTight(),
                                              fontSize: 16.0,
                                              letterSpacing: 0.0,
                                            ),
                                      ),
                                    ),
                                  );
                                }

                                return StreamBuilder<CompanyRecord>(
                                  stream: CompanyRecord.getDocument(companyRef),
                                  builder: (context, snapshot) {
                                    if (!snapshot.hasData) {
                                      return Center(
                                        child: CircularProgressIndicator(
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                            FlutterFlowTheme.of(context)
                                                .primary,
                                          ),
                                        ),
                                      );
                                    }
                                    final company = snapshot.data!;
                                    return SingleChildScrollView(
                                      padding: const EdgeInsets.all(20.0),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          _buildSearchSection(context, company),
                                          const SizedBox(height: 24.0),
                                          _buildNumbersTable(context, company),
                                        ],
                                      ),
                                    );
                                  },
                                );
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

  Widget _buildSearchSection(
    BuildContext context,
    CompanyRecord companyRecord,
  ) {
    _model.areaCodeController ??=
        TextEditingController(text: _model.selectedAreaCode ?? '');
    _model.areaCodeFocusNode ??= FocusNode();

    final theme = FlutterFlowTheme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: theme.primaryBackground,
        borderRadius: BorderRadius.circular(16.0),
      ),
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Search available numbers',
            style: theme.titleMedium.override(
              font: GoogleFonts.interTight(),
              letterSpacing: 0.0,
            ),
          ),
          const SizedBox(height: 12.0),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _model.areaCodeController,
                  focusNode: _model.areaCodeFocusNode,
                  decoration: InputDecoration(
                    labelText: 'Area code (optional)',
                    labelStyle: theme.labelMedium,
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(
                        color: theme.alternate,
                        width: 1.0,
                      ),
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(
                        color: theme.primary,
                        width: 1.5,
                      ),
                      borderRadius: BorderRadius.circular(12.0),
                    ),
                  ),
                  keyboardType: TextInputType.number,
                  onChanged: (value) => _model.selectedAreaCode = value,
                ),
              ),
              const SizedBox(width: 12.0),
              FFButtonWidget(
                onPressed: _model.isSearching
                    ? null
                    : () async {
                        await _searchNumbers(companyRecord);
                      },
                text: _model.isSearching ? 'Searching…' : 'Search',
                options: FFButtonOptions(
                  height: 44.0,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24.0, vertical: 0),
                  color: theme.primary,
                  textStyle: theme.titleSmall.override(
                    font: GoogleFonts.interTight(),
                    color: Colors.white,
                    letterSpacing: 0.0,
                  ),
                  elevation: 2.0,
                  borderRadius: BorderRadius.circular(12.0),
                ),
              ),
            ],
          ),
          if (_model.searchError != null)
            Padding(
              padding: const EdgeInsets.only(top: 12.0),
              child: Text(
                _model.searchError!,
                style: theme.labelMedium.override(
                  font: GoogleFonts.inter(),
                  color: theme.error,
                  letterSpacing: 0.0,
                ),
              ),
            ),
          if (_model.isSearching)
            Padding(
              padding: const EdgeInsets.only(top: 16.0),
              child: Row(
                children: [
                  CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(theme.primary),
                  ),
                  const SizedBox(width: 12.0),
                  Text(
                    'Contacting Twilio…',
                    style: theme.bodyMedium.override(
                      font: GoogleFonts.inter(),
                      letterSpacing: 0.0,
                    ),
                  ),
                ],
              ),
            )
          else ...[
            if (_model.searchResults.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16.0),
                child: Text(
                  'Enter an area code and tap search to view available numbers.',
                  style: theme.bodyMedium.override(
                    font: GoogleFonts.inter(),
                    letterSpacing: 0.0,
                  ),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(top: 16.0),
                child: Column(
                  children: _model.searchResults
                      .map(
                        (number) => _buildSearchResultCard(
                          context,
                          number,
                          companyRecord,
                        ),
                      )
                      .toList(),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _buildSearchResultCard(
    BuildContext context,
    AvailablePhoneNumber number,
    CompanyRecord company,
  ) {
    final isProcessing = _model.processingPhone == number.phoneNumber;
    final theme = FlutterFlowTheme.of(context);

    final locationParts = <String>[
      if (number.friendlyName != null && number.friendlyName!.isNotEmpty)
        number.friendlyName!,
      if (number.locality != null && number.locality!.isNotEmpty)
        number.locality!,
      if (number.region != null && number.region!.isNotEmpty) number.region!,
      if (number.isoCountry != null && number.isoCountry!.isNotEmpty)
        number.isoCountry!,
    ];

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12.0),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12.0),
        color: theme.secondaryBackground,
        border: Border.all(
          color: theme.alternate,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  number.phoneNumber,
                  style: theme.titleSmall.override(
                    font: GoogleFonts.interTight(),
                    letterSpacing: 0.0,
                  ),
                ),
                if (locationParts.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4.0),
                    child: Text(
                      locationParts.join(' • '),
                      style: theme.bodySmall.override(
                        font: GoogleFonts.inter(),
                        letterSpacing: 0.0,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          FFButtonWidget(
            onPressed: isProcessing
                ? null
                : () async {
                    await _purchaseNumber(company, number);
                  },
            text: isProcessing ? 'Purchasing…' : 'Purchase',
            options: FFButtonOptions(
              height: 38.0,
              padding:
                  const EdgeInsets.symmetric(horizontal: 20.0, vertical: 0.0),
              color: theme.primary,
              textStyle: theme.titleSmall.override(
                font: GoogleFonts.interTight(),
                color: Colors.white,
                letterSpacing: 0.0,
              ),
              borderRadius: BorderRadius.circular(10.0),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNumbersTable(
    BuildContext context,
    CompanyRecord company,
  ) {
    final numbers = company.phoneNumberMap;
    final theme = FlutterFlowTheme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16.0),
        color: theme.primaryBackground,
      ),
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Configured numbers',
            style: theme.titleMedium.override(
              font: GoogleFonts.interTight(),
              letterSpacing: 0.0,
            ),
          ),
          const SizedBox(height: 12.0),
          if (numbers.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24.0),
              child: Center(
                child: Text(
                  'No phone numbers configured yet.',
                  style: theme.bodyMedium.override(
                    font: GoogleFonts.inter(),
                    letterSpacing: 0.0,
                  ),
                ),
              ),
            )
          else
            FlutterFlowDataTable<PhoneNumberStruct>(
              controller: _model.paginatedDataTableController,
              data: numbers,
              columnsBuilder: (_) => [
                DataColumn2(
                  label: Text(
                    'Number',
                    style: theme.labelLarge.override(
                      font: GoogleFonts.inter(),
                      letterSpacing: 0.0,
                    ),
                  ),
                ),
                DataColumn2(
                  label: Text(
                    'Forwarding',
                    style: theme.labelLarge.override(
                      font: GoogleFonts.inter(),
                      letterSpacing: 0.0,
                    ),
                  ),
                ),
                DataColumn2(
                  label: Text(
                    'Actions',
                    style: theme.labelLarge.override(
                      font: GoogleFonts.inter(),
                      letterSpacing: 0.0,
                    ),
                  ),
                ),
              ],
              dataRowBuilder: (phoneItem, index, __, ___) {
                final isProcessing =
                    _model.processingPhone == phoneItem.phoneNumber;
                return DataRow(cells: [
                  DataCell(
                    Text(
                      phoneItem.phoneNumber,
                      style: theme.bodyMedium.override(
                        font: GoogleFonts.inter(),
                        letterSpacing: 0.0,
                      ),
                    ),
                  ),
                  DataCell(
                    Text(
                      valueOrDefault<String>(
                        phoneItem.forwardingNumber,
                        'Unset',
                      ),
                      style: theme.bodyMedium.override(
                        font: GoogleFonts.inter(),
                        letterSpacing: 0.0,
                      ),
                    ),
                  ),
                  DataCell(
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        FlutterFlowIconButton(
                          borderColor: Colors.transparent,
                          borderRadius: 12.0,
                          borderWidth: 1.0,
                          buttonSize: 40.0,
                          icon: Icon(
                            Icons.settings,
                            color: theme.primaryText,
                            size: 18.0,
                          ),
                          onPressed: () async {
                            await _configureNumber(
                              phoneItem.phoneNumber,
                              company.name,
                            );
                          },
                        ),
                        FlutterFlowIconButton(
                          borderColor: Colors.transparent,
                          borderRadius: 12.0,
                          borderWidth: 1.0,
                          buttonSize: 40.0,
                          icon: Icon(
                            Icons.delete_outline,
                            color: theme.error,
                            size: 18.0,
                          ),
                          onPressed: isProcessing
                              ? null
                              : () async {
                                  await _releaseNumber(company, phoneItem);
                                },
                        ),
                        FlutterFlowIconButton(
                          borderColor: Colors.transparent,
                          borderRadius: 12.0,
                          borderWidth: 1.0,
                          buttonSize: 40.0,
                          icon: Icon(
                            Icons.edit,
                            color: theme.primaryText,
                            size: 18.0,
                          ),
                          onPressed: () async {
                            await showDialog(
                              context: context,
                              builder: (dialogContext) {
                                return Dialog(
                                  elevation: 0,
                                  insetPadding: EdgeInsets.zero,
                                  backgroundColor: Colors.transparent,
                                  child: GestureDetector(
                                    onTap: () {
                                      FocusScope.of(dialogContext).unfocus();
                                      FocusManager.instance.primaryFocus
                                          ?.unfocus();
                                    },
                                    child: EditNumberWidget(
                                      phonenumber: phoneItem,
                                    ),
                                  ),
                                );
                              },
                            );
                            safeSetState(() {});
                          },
                        ),
                      ],
                    ),
                  ),
                ]);
              },
              paginated: false,
              hidePaginator: true,
              selectable: false,
              minWidth: 700.0,
            ),
        ],
      ),
    );
  }

  Future<void> _searchNumbers(CompanyRecord company) async {
    final areaCode = _model.areaCodeController?.text.trim();
    setState(() {
      _model.isSearching = true;
      _model.searchError = null;
      _model.processingPhone = null;
    });

    try {
      final results = await WorkflowService.searchPhoneNumbers(
        areaCode: areaCode?.isEmpty ?? true ? null : areaCode,
        country: 'US',
        limit: 10,
      );
      setState(() {
        _model.searchResults = results;
      });
    } catch (error) {
      setState(() {
        _model.searchResults = const [];
        _model.searchError = error.toString();
      });
    } finally {
      setState(() {
        _model.isSearching = false;
      });
    }
  }

  Future<void> _purchaseNumber(
    CompanyRecord company,
    AvailablePhoneNumber number,
  ) async {
    final companyId = company.reference.id;
    setState(() {
      _model.processingPhone = number.phoneNumber;
      _model.searchError = null;
    });

    try {
      await WorkflowService.purchasePhoneNumber(
        phoneNumber: number.phoneNumber,
        friendlyName: company.name,
        companyId: companyId,
      );
      await WorkflowService.configurePhoneNumber(
        number: number.phoneNumber,
        friendlyName: company.name,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Phone number ${number.phoneNumber} purchased successfully.',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).primary,
        ),
      );
      setState(() {
        _model.searchResults = _model.searchResults
            .where((element) => element.phoneNumber != number.phoneNumber)
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Failed to purchase number: $error',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).error,
        ),
      );
    } finally {
      setState(() {
        _model.processingPhone = null;
      });
    }
  }

  Future<void> _configureNumber(
    String phoneNumber,
    String? friendlyName,
  ) async {
    setState(() {
      _model.processingPhone = phoneNumber;
    });
    try {
      await WorkflowService.configurePhoneNumber(
        number: phoneNumber,
        friendlyName: friendlyName,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Configuration sent to Twilio for $phoneNumber.',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).primary,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Failed to configure number: $error',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).error,
        ),
      );
    } finally {
      setState(() {
        _model.processingPhone = null;
      });
    }
  }

  Future<void> _releaseNumber(
    CompanyRecord company,
    PhoneNumberStruct phone,
  ) async {
    if (phone.id.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Cannot release this number because the Twilio SID is missing.',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).error,
        ),
      );
      return;
    }

    setState(() {
      _model.processingPhone = phone.phoneNumber;
    });

    try {
      await WorkflowService.releasePhoneNumber(
        sid: phone.id,
        phoneNumber: phone.phoneNumber,
        companyId: company.reference.id,
        friendlyName: company.name,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Phone number ${phone.phoneNumber} released.',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).primary,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Failed to release number: $error',
            style: TextStyle(
              color: FlutterFlowTheme.of(context).primaryBackground,
            ),
          ),
          backgroundColor: FlutterFlowTheme.of(context).error,
        ),
      );
    } finally {
      setState(() {
        _model.processingPhone = null;
      });
    }
  }
}

