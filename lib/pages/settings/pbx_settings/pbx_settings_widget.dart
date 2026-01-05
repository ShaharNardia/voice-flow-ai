import '/backend/backend.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/flutter_flow/info_tooltip_widget.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'pbx_settings_model.dart';
export 'pbx_settings_model.dart';

class PbxSettingsWidget extends StatefulWidget {
  const PbxSettingsWidget({
    super.key,
    required this.company,
  });

  final CompanyRecord company;

  @override
  State<PbxSettingsWidget> createState() => _PbxSettingsWidgetState();
}

class _PbxSettingsWidgetState extends State<PbxSettingsWidget> {
  late PbxSettingsModel _model;

  @override
  void setState(VoidCallback callback) {
    super.setState(callback);
    _model.onUpdate();
  }

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => PbxSettingsModel());

    _model.telephonyProviderValue = widget.company.telephonyProvider;
    
    _model.bridgeUrlController ??= TextEditingController(
      text: widget.company.asteriskBridgeUrl,
    );
    _model.bridgeUrlFocusNode ??= FocusNode();

    _model.bridgeSecretController ??= TextEditingController(
      text: widget.company.asteriskBridgeSecret,
    );
    _model.bridgeSecretFocusNode ??= FocusNode();

    _model.callerIdController ??= TextEditingController(
      text: widget.company.asteriskCallerId,
    );
    _model.callerIdFocusNode ??= FocusNode();

    _model.sipTrunkController ??= TextEditingController(
      text: widget.company.sipTrunkName,
    );
    _model.sipTrunkFocusNode ??= FocusNode();

    _model.ddiController ??= TextEditingController(
      text: widget.company.defaultDdi,
    );
    _model.ddiFocusNode ??= FocusNode();

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.maybeDispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: FlutterFlowTheme.of(context).secondaryBackground,
        borderRadius: BorderRadius.circular(12.0),
        border: Border.all(
          color: FlutterFlowTheme.of(context).alternate,
          width: 1.0,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Icon(
                  Icons.settings_phone,
                  color: FlutterFlowTheme.of(context).primary,
                  size: 28.0,
                ),
                const SizedBox(width: 12.0),
                Text(
                  'PBX / Telephony Settings',
                  style: FlutterFlowTheme.of(context).headlineSmall.override(
                        fontFamily: GoogleFonts.interTight().fontFamily,
                        letterSpacing: 0.0,
                      ),
                ),
                const SizedBox(width: 8.0),
                const InfoTooltipWidget(
                  message: 'Configure how your calls are made. You can use Twilio (cloud) or connect your own Asterisk PBX system.',
                ),
              ],
            ),
            const SizedBox(height: 24.0),

            // Provider Selection
            Row(
              children: [
                Text(
                  'Telephony Provider',
                  style: FlutterFlowTheme.of(context).bodyMedium.override(
                        fontFamily: GoogleFonts.inter().fontFamily,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.0,
                      ),
                ),
                const SizedBox(width: 8.0),
                const InfoTooltipWidget(
                  message: 'Choose where your calls go through. Twilio is easy to set up. Asterisk lets you use your own phone system.',
                ),
              ],
            ),
            const SizedBox(height: 8.0),
            Row(
              children: [
                Expanded(
                  child: _buildProviderOption(
                    context,
                    'twilio',
                    'Twilio',
                    'Cloud-based, easy setup',
                    Icons.cloud_outlined,
                  ),
                ),
                const SizedBox(width: 12.0),
                Expanded(
                  child: _buildProviderOption(
                    context,
                    'asterisk',
                    'Asterisk / PBX',
                    'Your own phone system',
                    Icons.dns_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24.0),

            // Asterisk Settings (shown only when Asterisk is selected)
            if (_model.telephonyProviderValue == 'asterisk') ...[
              Container(
                padding: const EdgeInsets.all(16.0),
                decoration: BoxDecoration(
                  color: FlutterFlowTheme.of(context).primaryBackground,
                  borderRadius: BorderRadius.circular(8.0),
                  border: Border.all(
                    color: FlutterFlowTheme.of(context).primary.withOpacity(0.3),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: FlutterFlowTheme.of(context).primary,
                          size: 20.0,
                        ),
                        const SizedBox(width: 8.0),
                        Text(
                          'Asterisk Bridge Configuration',
                          style: FlutterFlowTheme.of(context).bodyMedium.override(
                                fontFamily: GoogleFonts.inter().fontFamily,
                                fontWeight: FontWeight.w600,
                                color: FlutterFlowTheme.of(context).primary,
                                letterSpacing: 0.0,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16.0),

                    // Bridge URL
                    _buildTextField(
                      context,
                      label: 'Bridge URL',
                      hint: 'https://your-server:3000',
                      controller: _model.bridgeUrlController!,
                      focusNode: _model.bridgeUrlFocusNode!,
                      tooltip: 'The URL where your Asterisk Bridge service is running. This connects VoiceFlow to your phone system.',
                    ),
                    const SizedBox(height: 16.0),

                    // Bridge Secret
                    _buildTextField(
                      context,
                      label: 'Bridge Secret',
                      hint: 'Your API secret key',
                      controller: _model.bridgeSecretController!,
                      focusNode: _model.bridgeSecretFocusNode!,
                      obscureText: true,
                      tooltip: 'A secret password to protect your bridge. Only people with this secret can make calls through your system.',
                    ),
                    const SizedBox(height: 16.0),

                    // Caller ID
                    _buildTextField(
                      context,
                      label: 'Default Caller ID',
                      hint: '+972501234567',
                      controller: _model.callerIdController!,
                      focusNode: _model.callerIdFocusNode!,
                      tooltip: 'The phone number that shows up when you call someone. This should be one of your DDI numbers.',
                    ),
                    const SizedBox(height: 16.0),

                    // SIP Trunk Name
                    _buildTextField(
                      context,
                      label: 'SIP Trunk Name',
                      hint: 'partner-trunk',
                      controller: _model.sipTrunkController!,
                      focusNode: _model.sipTrunkFocusNode!,
                      tooltip: 'The name of your SIP trunk in Asterisk. This is how Asterisk knows which phone company to use for calls.',
                    ),
                    const SizedBox(height: 16.0),

                    // Default DDI
                    _buildTextField(
                      context,
                      label: 'Default DDI Number',
                      hint: '+972501234567',
                      controller: _model.ddiController!,
                      focusNode: _model.ddiFocusNode!,
                      tooltip: 'Your main phone number from your phone company. DDI means Direct Dial In - the number people call to reach you.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24.0),
            ],

            // Save Button
            FFButtonWidget(
              onPressed: () async {
                await widget.company.reference.update(createCompanyRecordData(
                  telephonyProvider: _model.telephonyProviderValue,
                  asteriskBridgeUrl: _model.bridgeUrlController?.text,
                  asteriskBridgeSecret: _model.bridgeSecretController?.text,
                  asteriskCallerId: _model.callerIdController?.text,
                  sipTrunkName: _model.sipTrunkController?.text,
                  defaultDdi: _model.ddiController?.text,
                ));

                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Settings saved successfully!',
                      style: TextStyle(
                        color: FlutterFlowTheme.of(context).primaryBackground,
                      ),
                    ),
                    backgroundColor: FlutterFlowTheme.of(context).primary,
                  ),
                );
              },
              text: 'Save Settings',
              options: FFButtonOptions(
                width: double.infinity,
                height: 48.0,
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                color: FlutterFlowTheme.of(context).primary,
                textStyle: FlutterFlowTheme.of(context).titleSmall.override(
                      fontFamily: GoogleFonts.inter().fontFamily,
                      color: Colors.white,
                      letterSpacing: 0.0,
                    ),
                elevation: 2.0,
                borderRadius: BorderRadius.circular(8.0),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProviderOption(
    BuildContext context,
    String value,
    String title,
    String subtitle,
    IconData icon,
  ) {
    final isSelected = _model.telephonyProviderValue == value;
    
    return InkWell(
      onTap: () {
        setState(() {
          _model.telephonyProviderValue = value;
        });
      },
      borderRadius: BorderRadius.circular(8.0),
      child: Container(
        padding: const EdgeInsets.all(16.0),
        decoration: BoxDecoration(
          color: isSelected
              ? FlutterFlowTheme.of(context).primary.withOpacity(0.1)
              : FlutterFlowTheme.of(context).primaryBackground,
          borderRadius: BorderRadius.circular(8.0),
          border: Border.all(
            color: isSelected
                ? FlutterFlowTheme.of(context).primary
                : FlutterFlowTheme.of(context).alternate,
            width: isSelected ? 2.0 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: isSelected
                  ? FlutterFlowTheme.of(context).primary
                  : FlutterFlowTheme.of(context).secondaryText,
              size: 24.0,
            ),
            const SizedBox(width: 12.0),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: FlutterFlowTheme.of(context).bodyMedium.override(
                          fontFamily: GoogleFonts.inter().fontFamily,
                          fontWeight: FontWeight.w600,
                          color: isSelected
                              ? FlutterFlowTheme.of(context).primary
                              : FlutterFlowTheme.of(context).primaryText,
                          letterSpacing: 0.0,
                        ),
                  ),
                  Text(
                    subtitle,
                    style: FlutterFlowTheme.of(context).bodySmall.override(
                          fontFamily: GoogleFonts.inter().fontFamily,
                          color: FlutterFlowTheme.of(context).secondaryText,
                          letterSpacing: 0.0,
                        ),
                  ),
                ],
              ),
            ),
            if (isSelected)
              Icon(
                Icons.check_circle,
                color: FlutterFlowTheme.of(context).primary,
                size: 24.0,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField(
    BuildContext context, {
    required String label,
    required String hint,
    required TextEditingController controller,
    required FocusNode focusNode,
    required String tooltip,
    bool obscureText = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: FlutterFlowTheme.of(context).bodySmall.override(
                    fontFamily: GoogleFonts.inter().fontFamily,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.0,
                  ),
            ),
            const SizedBox(width: 4.0),
            InfoTooltipWidget(message: tooltip),
          ],
        ),
        const SizedBox(height: 4.0),
        TextFormField(
          controller: controller,
          focusNode: focusNode,
          obscureText: obscureText,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: FlutterFlowTheme.of(context).bodyMedium.override(
                  fontFamily: GoogleFonts.inter().fontFamily,
                  color: FlutterFlowTheme.of(context).secondaryText,
                  letterSpacing: 0.0,
                ),
            filled: true,
            fillColor: FlutterFlowTheme.of(context).secondaryBackground,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12.0,
              vertical: 12.0,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8.0),
              borderSide: BorderSide(
                color: FlutterFlowTheme.of(context).alternate,
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8.0),
              borderSide: BorderSide(
                color: FlutterFlowTheme.of(context).alternate,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8.0),
              borderSide: BorderSide(
                color: FlutterFlowTheme.of(context).primary,
                width: 2.0,
              ),
            ),
          ),
          style: FlutterFlowTheme.of(context).bodyMedium.override(
                fontFamily: GoogleFonts.inter().fontFamily,
                letterSpacing: 0.0,
              ),
        ),
      ],
    );
  }
}

