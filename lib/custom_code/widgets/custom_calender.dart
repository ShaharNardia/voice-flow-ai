// Automatic FlutterFlow imports
import '/backend/backend.dart';
import '/backend/schema/structs/index.dart';
import '/backend/schema/enums/enums.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'index.dart'; // Imports other custom widgets
import '/custom_code/actions/index.dart'; // Imports custom actions
import '/flutter_flow/custom_functions.dart'; // Imports custom functions
import 'package:flutter/material.dart';
// Begin custom widget code
// DO NOT REMOVE OR MODIFY THE CODE ABOVE!

import 'package:google_fonts/google_fonts.dart';

class CustomCalender extends StatefulWidget {
  final double? width;
  final double? height;
  final Future Function(JobsRecord job) onJobTap;
  final DateTime selectedDate;
  final CalendarViewType viewType;
  final DocumentReference company;

  const CustomCalender({
    super.key,
    this.width,
    this.height,
    required this.onJobTap,
    required this.selectedDate,
    this.viewType = CalendarViewType.timeline,
    required this.company,
  });

  @override
  State<CustomCalender> createState() => _CustomCalenderState();
}

class _CustomCalenderState extends State<CustomCalender> {
  final int startHour = 0; // 12 AM
  final int endHour = 24; // 12 AM (next day)

  late ScrollController techListController;
  late ScrollController jobListController;
  bool isSyncing = false;

  // double get pixelsPerHour =>
  //     MediaQuery.of(context).size.width / (endHour - startHour);
  // double get pixelsPerHour {
  //   // Make sure the available space fits the screen width
  //   final availableWidth = MediaQuery.of(context).size.width;
  //   final hourCount = endHour - startHour;
  //   final maxWidthPerHour = availableWidth / hourCount;

  //   // Ensure the max width doesn't cause overflow (if the screen width is too small, we use a reasonable value)
  //   return maxWidthPerHour;
  // }
  double get pixelsPerHour {
    // Calculate available width (screen width minus technician column)
    final screenWidth = MediaQuery.of(context).size.width;
    final availableWidth =
        screenWidth - 250; // Adjust 250 if your sidebar is different

    // Minimum width per hour to ensure readability
    const minHourWidth = 200.0; // Minimum 60px per hour

    // Calculate how much space we need for all hours
    final totalHours = endHour - startHour;
    final calculatedWidth = availableWidth / totalHours;

    // Use whichever is larger - calculated or minimum
    return calculatedWidth > minHourWidth ? calculatedWidth : minHourWidth;
  }

  double get timelineWidth => (endHour - startHour) * pixelsPerHour;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();

    // Delay the state change to simulate loading
    Future.delayed(Duration(seconds: 3), () {
      setState(() {
        isLoading = false; // Once data is ready, set loading to false
      });
    });

    techListController = ScrollController();
    jobListController = ScrollController();

    techListController.addListener(() {
      isSyncing = true;
      jobListController.jumpTo(techListController.offset);
      isSyncing = false;
    });

    jobListController.addListener(() {
      isSyncing = true;
      techListController.jumpTo(jobListController.offset);
      isSyncing = false;
    });
  }

  // Method to fetch unassigned jobs from Firestore
  Stream<List<JobsRecord>> fetchUnassignedJobs() {
    return queryJobsRecord(
        queryBuilder: (jobsRecord) => jobsRecord
            .where('status', isEqualTo: JobStatus.Unassigned.serialize())
            .where('company', isEqualTo: widget.company!.id));
  }

  @override
  void dispose() {
    techListController.dispose();
    jobListController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
        ),
      ); // Show loading until the data is ready
    }
    switch (widget.viewType) {
      case CalendarViewType.timeline:
        return buildTimeLineCalender();
      case CalendarViewType.weekly:
        return buildWeeklyView(context);
      case CalendarViewType.monthly:
        return _buildMonthlyView();
    }
  }

  CalendarWithHeader(
      {required final Widget topContent,
      required final Widget calendarContent}) {
    return Column(
      children: [
        topContent,
        // Use SizedBox with fixed height for the calendar
        SizedBox(
          height: MediaQuery.of(context).size.height -
              120, // Adjust height as needed
          child: SingleChildScrollView(
            child: calendarContent, // Ensure calendar content scrolls if needed
          ),
        ),
      ],
    );
  }

  // Function to handle multiple jobs on a day
  Widget jobMultipleHandleWidget(BuildContext context, List<JobsRecord> jobs,
      DateTime startOfWeek, double dayWidth, Color color) {
    final jobCount = jobs.length;

    return GestureDetector(
      onTap: () {
        if (jobCount > 1) {
          _showJobListBottomSheet(
              context,
              jobs,
              jobs.any((element) => element.status == JobStatus.Cancelled)
                  ? Colors.red
                  : jobs.any((element) => element.status == JobStatus.Pending)
                      ? const Color(0xFA75888F)
                      : color);
        } else {
          _handleJobTap(jobs[0]);
        }
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: color,
        ),
        child: Row(children:

                // jobCount > 1
                //     ?
                [
          // Main Job Card (75%)
          // Expanded(
          //   flex: 3,
          //   child: _buildStylishJobCard(jobs[0], color),
          // ),

          // const SizedBox(width: 4),
          // "+N" Indicator Card (25%)
          Expanded(
            // flex: 1,
            child: Container(
                height: double.infinity,
                decoration: BoxDecoration(
                  color: jobs.any(
                          (element) => element.status == JobStatus.Cancelled)
                      ? Colors.red
                      : jobs.any(
                              (element) => element.status == JobStatus.Pending)
                          ? const Color(0xFA75888F)
                          : color,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 4,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Container(
                  height:
                      40, // Define the height (you can adjust this based on your needs)
                  width:
                      40, // Define the width to make it circular (can be adjusted based on your needs)
                  decoration: BoxDecoration(
                    color: Colors.transparent, // No fill color
                    borderRadius: BorderRadius.circular(50), // Circular shape
                    border: Border.all(
                      color: Colors.white, // White border color
                      width: 2, // Border width
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '+${jobCount}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                )),
          ),
        ]
            // : [
            //     // Full-width card for a single job
            //     Expanded(
            //       child: _buildStylishJobCard(jobs[0], color),
            //     ),
            //   ],
            ),
      ),
    );
  }

// Function to handle multiple unassigned jobs on a day
  Widget unassignedJobMultipleHandleWidget(
      BuildContext context,
      List<JobsRecord> jobs,
      DateTime startOfWeek,
      double dayWidth,
      Color color) {
    final jobCount = jobs.length;

    return GestureDetector(
      onTap: () {
        // if (jobCount > 1) {
        _showJobListBottomSheet(
            context,
            jobs,
            jobs.any((element) => element.status == JobStatus.Cancelled)
                ? Colors.red
                : jobs.any((element) => element.status == JobStatus.Pending)
                    ? const Color(0xFA75888F)
                    : color);
        // } else {
        //   _handleJobTap(jobs[0]);
        // }
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: jobs.any((element) => element.status == JobStatus.Cancelled)
              ? Colors.red
              : jobs.any((element) => element.status == JobStatus.Pending)
                  ? const Color(0xFA75888F)
                  : color,
        ),
        child: Row(children:
                // jobCount > 1
                //     ?
                [
          // Main Job Card (75%)
          // Expanded(
          //   flex: 3,
          //   child: _buildStylishUnassignedJobCard(jobs[0], color),
          // ),
          // const SizedBox(width: 4),
          // "+N" Indicator Card (25%)
          Expanded(
            // flex: 1,
            child: Container(
                height: double.infinity,
                decoration: BoxDecoration(
                  color: jobs.any(
                          (element) => element.status == JobStatus.Cancelled)
                      ? Colors.red
                      : jobs.any(
                              (element) => element.status == JobStatus.Pending)
                          ? const Color(0xFA75888F)
                          : color,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Container(
                  height:
                      40, // Define the height (you can adjust this based on your needs)
                  width:
                      40, // Define the width to make it circular (can be adjusted based on your needs)
                  decoration: BoxDecoration(
                    color: Colors.transparent, // No fill color
                    borderRadius: BorderRadius.circular(50), // Circular shape
                    border: Border.all(
                      color: Colors.white, // White border color
                      width: 2, // Border width
                    ),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '+${jobCount}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                )),
          ),
        ]
            // : [
            //     // Full-width card for a single unassigned job
            //     Expanded(
            //       child: _buildStylishUnassignedJobCard(jobs[0], color),
            //     ),
            //   ],
            ),
      ),
    );
  }

  String _statusToText(JobStatus? status) {
    switch (status) {
      case JobStatus.Pending:
        return "Pending";
      case JobStatus.Inprogress:
        return "In Progress";
      case JobStatus.Completed:
        return "Completed";
      case JobStatus.Unassigned:
        return "Unassigned";
      default:
        return "Unknown Status"; // Handle unexpected values
    }
  }

  Widget buildTimeLineCalender() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12.0),
          topRight: Radius.circular(12.0),
        ),
        border: Border.all(
          color: Colors.grey.shade300,
        ),
      ),
      child: StreamBuilder<List<TechnicianRecord>>(
        stream: queryTechnicianRecord(
          queryBuilder: (tech) =>
              tech.where('company', isEqualTo: widget.company).where(
                    'status',
                    isEqualTo: 'active',
                  ),
        ),
        builder: (context, techSnapshot) {
          if (!techSnapshot.hasData) {
            return const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
              ),
            );
          }
          final technicians = techSnapshot.data!;
          if (technicians.isEmpty) {
            return const Center(child: Text('No technicians found.'));
          }

          return StreamBuilder<List<JobsRecord>>(
            stream: queryJobsRecord(),
            builder: (context, jobSnapshot) {
              if (!jobSnapshot.hasData) {
                return const Center(
                  child: CircularProgressIndicator(
                    valueColor:
                        AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
                  ),
                );
              }
              final allJobs = jobSnapshot.data!;

              return Row(
                children: [
                  // Technician Names Column
                  Container(
                    width: 250,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(
                        color: Colors.grey.shade300,
                        width: 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        Container(
                          height: 110,
                          alignment: Alignment.centerLeft,
                          padding: const EdgeInsets.only(
                              left: 16, right: 16), // Added right padding
                          color:
                              Colors.white, // Light background for technician
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(),
                              Row(
                                children: [
                                  // Avatar
                                  Text(
                                    "Unassigned",
                                    style: TextStyle(
                                      fontSize: 18, // Larger font size
                                      fontWeight:
                                          FontWeight.bold, // Bold font weight
                                      color: Colors
                                          .black, // Red accent color to highlight
                                      letterSpacing:
                                          1.2, // Slight letter spacing for better readability
                                      height:
                                          1.5, // Custom font family (Optional)
                                    ),
                                  )
                                ],
                              ),

                              SizedBox(),
                              // Divider thickness
                              // indent: 16, // Left padding for the divider
                              // endIndent:
                              //     16, // Right padding for the divider
                              // ),
                            ],
                          ),
                        ),
                        Container(
                          height: 40,
                          // Technician column background
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border(
                              top: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              bottom: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              right: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: ListView.builder(
                            controller: techListController,
                            itemCount: technicians.length,
                            itemBuilder: (context, index) {
                              final filteredJobs = allJobs
                                  .where((job) =>
                                      job.technician ==
                                          technicians[index].reference &&
                                      job.status != JobStatus.Unassigned &&
                                      job.status != JobStatus.Completed)
                                  .toList();
                              return Container(
                                height: index == 0 ? 115 : 110,
                                alignment: Alignment.centerLeft,
                                // Added right padding
                                color: Colors
                                    .white, // Light background for technician
                                child: Column(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    SizedBox(),
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 16, right: 16),
                                      child: Row(
                                        children: [
                                          // Avatar
                                          CircleAvatar(
                                            radius: 25,
                                            backgroundImage: technicians[index]
                                                            .imageUrl !=
                                                        null &&
                                                    technicians[index]
                                                        .imageUrl
                                                        .isNotEmpty
                                                ? NetworkImage(
                                                    technicians[index].imageUrl)
                                                : NetworkImage(
                                                    'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.0.3'),
                                          ),

                                          SizedBox(
                                              width:
                                                  16), // Space between avatar and text

                                          // Column for Name and Email
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                SizedBox(
                                                  height: 10,
                                                ),
                                                // Technician Name
                                                Text(
                                                  technicians[index].name,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 16,
                                                    overflow: TextOverflow
                                                        .ellipsis, // Avoid name overflow
                                                  ),
                                                  maxLines:
                                                      1, // Limit the name to one line
                                                  softWrap:
                                                      false, // Ensure name doesn't wrap to the next line
                                                  overflow: TextOverflow
                                                      .ellipsis, // Ensure truncation if the name is too long
                                                ),

                                                // Email under the name
                                                SizedBox(
                                                    height:
                                                        4), // Spacing between name and email
                                                Text(
                                                  "Open Jobs: ${filteredJobs.length}",
                                                  style: TextStyle(
                                                    fontSize: 14,
                                                    color: Colors.grey
                                                        .shade600, // Subtitle style (lighter color)
                                                  ),
                                                  maxLines:
                                                      1, // Ensure email stays on one line
                                                  overflow: TextOverflow
                                                      .ellipsis, // Avoid email overflow
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    // Divider after each item
                                    Divider(
                                      color: Colors.grey
                                          .shade200, // Color for the divider
                                      thickness: 1, // Divider thickness
                                      // indent: 16, // Left padding for the divider
                                      // endIndent:
                                      //     16, // Right padding for the divider
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        )
                      ],
                    ),
                  ),
                  // Timeline Section
                  Expanded(
                    child: Container(
                      color: Colors.grey.shade200,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // SingleChildScrollView(
                          //   scrollDirection: Axis.horizontal,
                          //   child: StreamBuilder<List<JobsRecord>>(
                          //     stream: fetchUnassignedJobs(),
                          //     builder: (context, snapshot) {
                          //       if (!snapshot.hasData) {
                          //         return Center(
                          //           child: CircularProgressIndicator(
                          //             valueColor: AlwaysStoppedAnimation<Color>(
                          //                 Color(0xfa002aff)),
                          //           ),
                          //         );
                          //       }

                          //       final unassignedJobs = snapshot.data!
                          //           .where((job) =>
                          //                   job.status ==
                          //                   JobStatus
                          //                       .Unassigned // Filter for Unassigned jobs
                          //               ) // Filter by the day
                          //           .toList();

                          //       if (unassignedJobs.isEmpty) {
                          //         return Container(
                          //           height: 110,
                          //           decoration: BoxDecoration(
                          //             border: Border(
                          //               bottom: BorderSide(
                          //                 color: Colors
                          //                     .black45, // Same color as the Divider
                          //                 width: 1,
                          //               ),
                          //             ),
                          //           ),
                          //         );
                          //       }

                          //       return _buildUnassignedJobRowTimeLine(
                          //           unassignedJobs); // Display Unassigned Jobs
                          //     },
                          //   ),
                          // ),

                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: StreamBuilder<List<JobsRecord>>(
                              stream: queryJobsRecord(
                                queryBuilder: (jobsRecord) => jobsRecord.where(
                                  'status',
                                  isEqualTo: JobStatus.Unassigned.serialize(),
                                ),
                              ),
                              builder: (context, snapshot) {
                                // Show a loading spinner while waiting for data
                                if (!snapshot.hasData) {
                                  return Center(
                                    child: SizedBox(
                                      width: 50,
                                      height: 50,
                                      child: CircularProgressIndicator(
                                        valueColor:
                                            AlwaysStoppedAnimation<Color>(
                                                Color(0xfa002aff)),
                                      ),
                                    ),
                                  );
                                }

                                List<JobsRecord> unassignedJobs =
                                    snapshot.data!;
                                // double totalWidth =
                                //     unassignedJobs.length * (dayWidth);
                                if (unassignedJobs.isEmpty) {
                                  return Container(
                                    height: 110, // fixed height as you want
                                    padding:
                                        EdgeInsets.symmetric(horizontal: 20),

                                    child: Center(
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.work_outline,
                                            color: Colors.blueAccent,
                                            size: 28,
                                          ),
                                          SizedBox(width: 12),
                                          Flexible(
                                            child: Text(
                                              "Your new jobs will be shown here.",
                                              style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.w600,
                                                color: Colors.black87,
                                              ),
                                              textAlign: TextAlign.left,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }

                                // Dynamically calculate total width based on screen width and job count
                                // dayWidth + spacing

                                return SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Container(
                                    // Ensure it stretches to available space
                                    height:
                                        110, // Height of the container to hold job blocks
                                    decoration: BoxDecoration(
                                      border: Border(
                                        bottom: BorderSide(
                                          color: Colors
                                              .black45, // Same color as the Divider
                                          width: 1,
                                        ),
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment
                                          .start, // Align items to the left
                                      children: [
                                        // Loop through unassigned jobs and render each job block with spacing
                                        for (int i = 0;
                                            i < unassignedJobs.length;
                                            i++) ...[
                                          _buildUnassignedJobBlock(
                                              unassignedJobs[
                                                  i]), // Render job block
                                          SizedBox(
                                              width:
                                                  12), // Add 12px spacing between blocks
                                        ],
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Container(
                                width: timelineWidth,
                                color: Colors.grey.shade200,
                                child: Column(
                                  children: [
                                    _buildTimelineHeader(),
                                    Expanded(
                                      child: ListView.builder(
                                        controller: jobListController,
                                        itemCount: technicians.length,
                                        itemBuilder: (context, index) {
                                          final technician = technicians[index];
                                          final filteredJobs = allJobs
                                              .where((job) =>
                                                  job.technician ==
                                                      technician.reference &&
                                                  job.status !=
                                                      JobStatus.Unassigned &&
                                                  job.status !=
                                                      JobStatus.Completed &&
                                                  job.requestedTime != null &&
                                                  job.requestedTime!.year ==
                                                      widget
                                                          .selectedDate.year &&
                                                  job.requestedTime!.month ==
                                                      widget
                                                          .selectedDate.month &&
                                                  job.requestedTime!.day ==
                                                      widget.selectedDate.day)
                                              .toList();

                                          return _buildTechnicianRow(
                                            technician,
                                            filteredJobs,
                                          );
                                        },
                                      ),
                                    )
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

// Unassigned Jobs Row (similar to Technician Row)
  // Widget _buildUnassignedJobRowTimeLine(List<JobsRecord> unassignedJobs) {
  //   final hourCount = endHour - startHour;

  //   return Container(
  //     height: 110,
  //     decoration: BoxDecoration(
  //       border: Border(
  //         bottom: BorderSide(
  //           color: Colors.black45, // Same color as the Divider
  //           width: 1,
  //         ),
  //       ),
  //     ),
  //     child: Stack(
  //       children: [
  //         Row(
  //           children: List.generate(hourCount, (i) {
  //             return Container(
  //               width: pixelsPerHour,
  //               decoration: BoxDecoration(
  //                 border: Border(
  //                   right: BorderSide(color: Colors.grey.shade300),
  //                 ),
  //               ),
  //             );
  //           }),
  //         ),
  //         for (final job in unassignedJobs)
  //           _buildUnassignedJobBlock(job),
  //       ],
  //     ),
  //   );
  // }
// Unassigned Jobs Row (Single Row for all Unassigned Jobs)
  Widget _buildUnassignedJobRowTimeLine(List<JobsRecord> unassignedJobs) {
    final hourCount = endHour - startHour;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Container(
        height: 110,
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: Colors.black45, // Same color as the Divider
              width: 1,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment:
              MainAxisAlignment.start, // Ensures spacing between items
          children: [
            // For each unassigned job, show its block without margin or padding
            for (final job in unassignedJobs) ...[
              _buildUnassignedJobBlock(job),
              SizedBox(width: 12),
            ]
          ],
        ),
      ),
    );
  }

// Unassigned Job Block (Positioning as needed)
  Widget _buildUnassignedJobBlock(JobsRecord job) {
    final startTime = job.requestedTime ?? DateTime.now();
    final endTime = job.endRequestedTime != null
        ? job.endRequestedTime
        : startTime.add(const Duration(hours: 2));

    final startHourFraction =
        (startTime.hour + (startTime.minute / 60)).toDouble();
    final endHourFraction = (endTime!.hour + (endTime.minute / 60)).toDouble();

    if (endHourFraction < startHour || startHourFraction >= endHour) {
      return const SizedBox(); // No rendering if job is out of bounds
    }

    String numStr = job.uniqueJobId.toString();
    String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);

    return GestureDetector(
      onTap: () {
        widget.onJobTap(job);
      },
      child: Container(
        width: 200, // Set width dynamically based on the job's duration
        decoration: BoxDecoration(
          color: Color(0xfa75888f),
          borderRadius: BorderRadius.circular(8),
        ),
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '#${number}',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              "${job.userName} - ${job.address}",
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.normal,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            // SizedBox(height: 4),
            // Row(children: [
            //   RoundContainer(
            //     context: context,
            //     value: job.status?.name ?? '',
            //   ),
            //   SizedBox(width: 4),
            //   RoundContainer(
            //     context: context,
            //     value: job.priotity?.name ?? '',
            //   ),
            // ])
          ],
        ),
      ),
    );
  }

  bool checkHalfHourInterval(DateTime startTime, DateTime endTime) {
    // Calculate the difference in minutes
    int differenceInMinutes = endTime.difference(startTime).inMinutes;

    // Check if the difference is less than or equal to 45 minutes
    if (differenceInMinutes <= 45) {
      return false; // The difference is 45 minutes or less
    }

    return true; // The difference is greater than 45 minutes
  }

  // Unassigned Job Block (calculating position and width dynamically)
  // Widget _buildUnassignedJobBlock(JobsRecord job) {
  //   final startTime = job.requestedTime ?? DateTime.now();
  //   final endTime =
  //       job.endRequestedTime ?? startTime.add(const Duration(hours: 2));

  //   final startHourFraction =
  //       (startTime.hour + (startTime.minute / 60)).toDouble();
  //   final endHourFraction = (endTime.hour + (endTime.minute / 60)).toDouble();

  //   final durationHours = endHourFraction - startHourFraction;
  //   final leftPx = ((startHourFraction - startHour) * pixelsPerHour).toDouble();
  //   final widthPx = (durationHours * pixelsPerHour).toDouble();

  //   if (endHourFraction < startHour || startHourFraction >= endHour) {
  //     return const SizedBox();
  //   }

  //   final adjustedLeft = leftPx < 0 ? 0.0 : leftPx;
  //   final adjustedWidth = leftPx < 0
  //       ? (widthPx + leftPx).toDouble()
  //       : (leftPx + widthPx) > timelineWidth
  //           ? (timelineWidth - leftPx).toDouble()
  //           : widthPx;
  //   String numStr = job.uniqueJobId.toString();
  //   String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);
  //   bool isPriorityShow = checkHalfHourInterval(startTime, endTime);
  //   return Positioned(
  //     left: adjustedLeft,
  //     top: 5.0,
  //     width: adjustedWidth,
  //     height: 100.0,
  //     child: GestureDetector(
  //       onTap: () => widget.onJobTap(job),
  //       child: Container(
  //         decoration: BoxDecoration(
  //           color: Color(0xfa75888f),
  //           borderRadius: BorderRadius.circular(8),
  //         ),
  //         padding: const EdgeInsets.all(8),
  //         child: Column(
  //           crossAxisAlignment: CrossAxisAlignment.start,
  //           mainAxisAlignment: MainAxisAlignment.center,
  //           children: [
  //             Text(
  //               '#${number}',
  //               maxLines: 1,
  //               overflow: TextOverflow.ellipsis,
  //               style: const TextStyle(
  //                 color: Colors.white,
  //                 fontWeight: FontWeight.bold,
  //               ),
  //             ),
  //             isPriorityShow ? SizedBox(height: 4) : SizedBox(),
  //             Text(
  //               job.title ?? "Unassigned Job",
  //               maxLines: isPriorityShow ? 2 : 1,
  //               overflow: TextOverflow.ellipsis,
  //               style: const TextStyle(
  //                 color: Colors.white,
  //                 fontWeight: FontWeight.bold,
  //               ),
  //             ),
  //             isPriorityShow ? SizedBox(height: 4) : SizedBox(),
  //             Row(mainAxisAlignment: MainAxisAlignment.start, children: [
  //               RoundContainer(
  //                 context: context,
  //                 value: job.status?.name ?? '',
  //               ),
  //               if (isPriorityShow) ...[
  //                 SizedBox(width: 4),
  //                 RoundContainer(
  //                   context: context,
  //                   value: job.priotity?.name ?? '',
  //                 ),
  //               ]
  //             ])
  //           ],
  //         ),
  //       ),
  //     ),
  //   );
  // }

  double get pixelsPerDay {
    final availableWidth = MediaQuery.of(context).size.width;
    final maxDaysInMonth =
        DateTime(widget.selectedDate.year, widget.selectedDate.month + 1, 0)
            .day; // Get the number of days in the current month
    return availableWidth /
        maxDaysInMonth; // Dynamically calculate pixels per day
  }

  Widget _buildMonthlyView() {
    final daysInMonth = DateUtils.getDaysInMonth(
      widget.selectedDate.year,
      widget.selectedDate.month,
    );

    final availableWidth = MediaQuery.of(context).size.width;
    final minWidthPerDay = 100.0;
    final pixelsPerDay = (availableWidth / daysInMonth) < minWidthPerDay
        ? minWidthPerDay
        : availableWidth / daysInMonth;

    final totalCalendarWidth = pixelsPerDay * daysInMonth;

    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12.0),
          topRight: Radius.circular(12.0),
        ),
        border: Border.all(
          color: Colors.grey.shade300,
        ),
      ),
      child: StreamBuilder<List<TechnicianRecord>>(
        stream: queryTechnicianRecord(
          queryBuilder: (tech) =>
              tech.where('company', isEqualTo: widget.company).where(
                    'status',
                    isEqualTo: 'active',
                  ),
        ),
        builder: (context, techSnapshot) {
          if (!techSnapshot.hasData) {
            return const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
              ),
            );
          }
          final technicians = techSnapshot.data!;
          if (technicians.isEmpty) {
            return const Center(child: Text('No technicians found.'));
          }

          return StreamBuilder<List<JobsRecord>>(
            stream: queryJobsRecord(),
            builder: (context, jobSnapshot) {
              if (!jobSnapshot.hasData) {
                return const Center(
                  child: CircularProgressIndicator(
                    valueColor:
                        AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
                  ),
                );
              }
              final allJobs = jobSnapshot.data!;

              return Row(
                children: [
                  // Technician Names Column
                  Container(
                    width: 250,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(
                        color: Colors.grey.shade300,
                        width: 1,
                      ),
                      borderRadius: BorderRadius.circular(
                          12), // Rounded corners for the column
                      boxShadow: [
                        BoxShadow(
                          color: Colors.grey.shade300,
                          blurRadius: 5,
                          offset: Offset(0, 2),
                        ),
                      ], // Add a shadow for a floating effect
                    ),
                    child: Column(
                      children: [
                        Container(
                          height: 110, // Updated height
                          alignment: Alignment.centerLeft,
                          padding: const EdgeInsets.only(left: 16, right: 16),
                          color: Colors.white,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(),
                              Row(
                                children: [
                                  Text(
                                    "Unassigned",
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.black,
                                      letterSpacing: 1.2,
                                    ),
                                  ),
                                ],
                              ),

                              SizedBox(),
                              // Divider after each item
                            ],
                          ),
                        ),
                        Container(
                          height: 40,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border(
                              top: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              bottom: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              right: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: ListView.builder(
                            controller: techListController,
                            itemCount: technicians.length,
                            itemBuilder: (context, index) {
                              final filteredJobs = allJobs
                                  .where((job) =>
                                      job.technician ==
                                          technicians[index].reference &&
                                      job.status != JobStatus.Unassigned &&
                                      job.status != JobStatus.Completed)
                                  .toList();
                              return Container(
                                height:
                                    index == 0 ? 155 : 150, // Updated height
                                alignment: Alignment.centerLeft,

                                color: Colors.white,
                                child: Column(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    SizedBox(),
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 16, right: 16),
                                      child: Row(
                                        children: [
                                          // Technician Avatar with larger size
                                          CircleAvatar(
                                            radius:
                                                25, // Increased radius for the avatar
                                            backgroundImage: technicians[index]
                                                            .imageUrl !=
                                                        null &&
                                                    technicians[index]
                                                        .imageUrl
                                                        .isNotEmpty
                                                ? NetworkImage(
                                                    technicians[index].imageUrl)
                                                : NetworkImage(
                                                    'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.0.3'),
                                          ),
                                          SizedBox(
                                              width:
                                                  16), // Space between avatar and text

                                          // Column for Name and Email
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                SizedBox(height: 10),
                                                // Technician Name
                                                Text(
                                                  technicians[index].name,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 16,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                  ),
                                                  maxLines: 1,
                                                  softWrap: false,
                                                ),

                                                // Email under the name
                                                SizedBox(height: 4),
                                                Text(
                                                  "Open Jobs: ${filteredJobs.length}",
                                                  style: TextStyle(
                                                    fontSize: 14,
                                                    color: Colors.grey.shade600,
                                                  ),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    // Divider after each item
                                    Divider(
                                      color: Colors.grey.shade200,
                                      thickness: 1,
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        )
                      ],
                    ),
                  ),
                  // Calendar Section
                  Expanded(
                    child: Container(
                      // width: totalCalendarWidth,
                      color: Colors.grey.shade100,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Dates row
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: StreamBuilder<List<JobsRecord>>(
                              stream: queryJobsRecord(
                                queryBuilder: (jobsRecord) => jobsRecord.where(
                                  'status',
                                  isEqualTo: JobStatus.Unassigned.serialize(),
                                ),
                              ),
                              builder: (context, snapshot) {
                                // Customize what your widget looks like when it's loading.
                                if (!snapshot.hasData) {
                                  return Center(
                                    child: SizedBox(
                                      width: 50,
                                      height: 50,
                                      child: CircularProgressIndicator(
                                        valueColor:
                                            AlwaysStoppedAnimation<Color>(
                                                Color(0xfa002aff)),
                                      ),
                                    ),
                                  );
                                }

                                List<JobsRecord> unassignedJobs =
                                    snapshot.data!;
                                if (unassignedJobs.isEmpty) {
                                  return Container(
                                    height: 110, // fixed height as you want
                                    padding:
                                        EdgeInsets.symmetric(horizontal: 20),
                                    decoration: BoxDecoration(
                                      color: Colors.grey
                                          .shade100, // light background for subtle highlight
                                    ),
                                    child: Center(
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.work_outline,
                                            color: Colors.blueAccent,
                                            size: 28,
                                          ),
                                          SizedBox(width: 12),
                                          Flexible(
                                            child: Text(
                                              "Your new jobs will be shown here.",
                                              style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.w600,
                                                color: Colors.black87,
                                              ),
                                              textAlign: TextAlign.left,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }

                                // Calculate total width dynamically based on job blocks
                                // dayWidth + spacing

                                return SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Container(
                                    // Ensure the container stretches to fill space
                                    height:
                                        110, // Set the desired height of your container
                                    decoration: BoxDecoration(
                                      border: Border(
                                        bottom: BorderSide(
                                          color: Colors.grey
                                              .shade100, // Same color as the Divider
                                          width: 3,
                                        ),
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment
                                          .start, // Align items to the left
                                      children: [
                                        // Loop through each unassigned job and display it
                                        for (int i = 0;
                                            i < unassignedJobs.length;
                                            i++) ...[
                                          _buildUnassignedJobBlock(
                                              unassignedJobs[i]),
                                          // Add a fixed space of 12px between the job blocks
                                          SizedBox(width: 12),
                                        ],
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Container(
                                width: totalCalendarWidth,
                                color: Colors.grey.shade100,
                                child: Column(
                                  children: [
                                    Container(
                                      height: 40,
                                      color: Colors.white,
                                      child: Row(
                                        children:
                                            List.generate(daysInMonth, (i) {
                                          final date = DateTime(
                                            widget.selectedDate.year,
                                            widget.selectedDate.month,
                                            i + 1,
                                          );
                                          return Container(
                                            width: pixelsPerDay,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              border: Border(
                                                right: BorderSide(
                                                    color:
                                                        Colors.grey.shade300),
                                                bottom: BorderSide(
                                                    color:
                                                        Colors.grey.shade300),
                                              ),
                                            ),
                                            child: Text(
                                              DateFormat('d').format(date),
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          );
                                        }),
                                      ),
                                    ),
                                    Expanded(
                                      child: ListView.builder(
                                        controller: jobListController,
                                        itemCount: technicians.length,
                                        itemBuilder: (context, techIndex) {
                                          final technician =
                                              technicians[techIndex];
                                          final jobsGroupedByDate =
                                              _groupJobsByDate(
                                                  allJobs, technician);
                                          final jobs = allJobs.where((job) {
                                            return job.technician ==
                                                    technician.reference &&
                                                job.status !=
                                                    JobStatus.Unassigned &&
                                                job.status !=
                                                    JobStatus.Completed &&
                                                job.requestedTime?.month ==
                                                    widget.selectedDate.month &&
                                                job.requestedTime?.year ==
                                                    widget.selectedDate.year;
                                          }).toList();

                                          return Container(
                                            height: 150,
                                            decoration: BoxDecoration(
                                              border: Border(
                                                bottom: BorderSide(
                                                  color: Colors
                                                      .grey, // Same color as the Divider
                                                  width: 1,
                                                ),
                                              ),
                                            ),
                                            child: Stack(
                                              children: [
                                                Row(
                                                  children: List.generate(
                                                      daysInMonth, (i) {
                                                    return Container(
                                                      width: pixelsPerDay,
                                                      decoration: BoxDecoration(
                                                        border: Border(
                                                          right: BorderSide(
                                                              color: Colors.grey
                                                                  .shade300),
                                                        ),
                                                      ),
                                                    );
                                                  }),
                                                ),
                                                // Stack jobs for the technician
                                                for (final date
                                                    in jobsGroupedByDate.keys)
                                                  _buildMonthlyJobCard(
                                                      jobsGroupedByDate[date]!,
                                                      pixelsPerDay,
                                                      date,
                                                      jobsGroupedByDate[date]!
                                                              .any((element) =>
                                                                  element
                                                                      .status ==
                                                                  JobStatus
                                                                      .Cancelled)
                                                          ? Colors.red
                                                          : technician.color ??
                                                              Color(
                                                                  0xfa002aff)),
                                              ],
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),

                          // Jobs rows per technician
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Map<DateTime, List<JobsRecord>> _groupJobsByDate(
      List<JobsRecord> jobs, TechnicianRecord technician) {
    final Map<DateTime, List<JobsRecord>> jobsGroupedByDate = {};

    for (final job in jobs) {
      if (job.technician == technician.reference &&
          job.status != JobStatus.Unassigned &&
          job.status != JobStatus.Completed &&
          job.requestedTime?.month == widget.selectedDate.month &&
          job.requestedTime?.year == widget.selectedDate.year) {
        final jobDate = DateTime(
          job.requestedTime!.year,
          job.requestedTime!.month,
          job.requestedTime!.day,
        );

        if (!jobsGroupedByDate.containsKey(jobDate)) {
          jobsGroupedByDate[jobDate] = [];
        }
        jobsGroupedByDate[jobDate]!.add(job);
      }
    }

    return jobsGroupedByDate;
  }

  Map<DateTime, List<JobsRecord>> _groupUnassignedJobsByDate(
      List<JobsRecord> jobs) {
    final Map<DateTime, List<JobsRecord>> unassignedJobsGroupedByDate = {};

    for (final job in jobs) {
      // Only consider jobs with Unassigned status
      if (job.status == JobStatus.Unassigned &&
          job.requestedTime?.month == widget.selectedDate.month &&
          job.requestedTime?.year == widget.selectedDate.year) {
        final jobDate = DateTime(
          job.requestedTime!.year,
          job.requestedTime!.month,
          job.requestedTime!.day,
        );

        // Group jobs by their date
        if (!unassignedJobsGroupedByDate.containsKey(jobDate)) {
          unassignedJobsGroupedByDate[jobDate] = [];
        }
        unassignedJobsGroupedByDate[jobDate]!.add(job);
      }
    }

    return unassignedJobsGroupedByDate;
  }

  Widget buildWeeklyView(context) {
    final daysInWeek = 7;
    final startOfWeek = widget.selectedDate.subtract(
      Duration(days: widget.selectedDate.weekday - 1),
    );
    final dayLabels = List.generate(
      daysInWeek,
      (i) => DateFormat('EEE\ndd').format(startOfWeek.add(Duration(days: i))),
    );

    final dayWidth = 200.0;
    final totalWidth = dayWidth * daysInWeek;

    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        // color: FlutterFlowTheme.of(context).secondaryBackground,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12.0),
          topRight: Radius.circular(12.0),
        ),
        border: Border.all(
          color: FlutterFlowTheme.of(context).alternate,
        ),
      ),
      child: StreamBuilder<List<TechnicianRecord>>(
        stream: queryTechnicianRecord(
          queryBuilder: (tech) =>
              tech.where('company', isEqualTo: widget.company).where(
                    'status',
                    isEqualTo: 'active',
                  ),
        ),
        builder: (context, techSnapshot) {
          if (!techSnapshot.hasData) {
            return const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
              ),
            );
          }
          final technicians = techSnapshot.data!;
          if (technicians.isEmpty) {
            return const Center(child: Text('No technicians found.'));
          }

          return StreamBuilder<List<JobsRecord>>(
            stream: queryJobsRecord(),
            builder: (context, jobSnapshot) {
              if (!jobSnapshot.hasData) {
                return const Center(
                  child: CircularProgressIndicator(
                    valueColor:
                        AlwaysStoppedAnimation<Color>(Color(0xfa002aff)),
                  ),
                );
              }
              final allJobs = jobSnapshot.data!;

              return Row(
                children: [
                  Container(
                    width: 250,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(
                        color: Colors.grey.shade300,
                        width: 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        Container(
                          height: 110,
                          alignment: Alignment.centerLeft,
                          padding: const EdgeInsets.only(
                              left: 16, right: 16), // Added right padding
                          color:
                              Colors.white, // Light background for technician
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(),
                              Row(
                                children: [
                                  // Avatar
                                  Text(
                                    "Unassigned",
                                    style: TextStyle(
                                      fontSize: 18, // Larger font size
                                      fontWeight:
                                          FontWeight.bold, // Bold font weight
                                      color: Colors
                                          .black, // Red accent color to highlight
                                      letterSpacing:
                                          1.2, // Slight letter spacing for better readability
                                      height:
                                          1.5, // Custom font family (Optional)
                                    ),
                                  )
                                ],
                              ),

                              SizedBox(),
                              // Divider after each item

                              // indent: 16, // Left padding for the divider
                              // endIndent:
                              //     16, // Right padding for the divider
                              // ),
                            ],
                          ),
                        ),
                        Container(
                          height: 40,
                          // Technician column background
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border(
                              top: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              bottom: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                              right: BorderSide(
                                color: Colors.grey.shade300,
                                width: 1,
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: ListView.builder(
                            controller: techListController,
                            itemCount: technicians.length,
                            itemBuilder: (context, index) {
                              final filteredJobs = allJobs
                                  .where((job) =>
                                      job.technician ==
                                          technicians[index].reference &&
                                      job.status != JobStatus.Unassigned &&
                                      job.status != JobStatus.Completed)
                                  .toList();
                              return Container(
                                height: index == 0 ? 115 : 110,
                                alignment: Alignment.centerLeft,

                                color: Colors
                                    .white, // Light background for technician
                                child: Column(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    SizedBox(),
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 16, right: 16),
                                      child: Row(
                                        children: [
                                          // Avatar
                                          CircleAvatar(
                                            radius: 25,
                                            backgroundImage: technicians[index]
                                                            .imageUrl !=
                                                        null &&
                                                    technicians[index]
                                                        .imageUrl
                                                        .isNotEmpty
                                                ? NetworkImage(
                                                    technicians[index].imageUrl)
                                                : NetworkImage(
                                                    'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.0.3'),
                                          ),

                                          SizedBox(
                                              width:
                                                  16), // Space between avatar and text

                                          // Column for Name and Email
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                SizedBox(
                                                  height: 10,
                                                ),
                                                // Technician Name
                                                Text(
                                                  technicians[index].name,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 16,
                                                    overflow: TextOverflow
                                                        .ellipsis, // Avoid name overflow
                                                  ),
                                                  maxLines:
                                                      1, // Limit the name to one line
                                                  softWrap:
                                                      false, // Ensure name doesn't wrap to the next line
                                                  overflow: TextOverflow
                                                      .ellipsis, // Ensure truncation if the name is too long
                                                ),

                                                // Email under the name
                                                SizedBox(
                                                    height:
                                                        4), // Spacing between name and email
                                                Text(
                                                  "Open Jobs: ${filteredJobs.length}",
                                                  style: TextStyle(
                                                    fontSize: 14,
                                                    color: Colors.grey
                                                        .shade600, // Subtitle style (lighter color)
                                                  ),
                                                  maxLines:
                                                      1, // Ensure email stays on one line
                                                  overflow: TextOverflow
                                                      .ellipsis, // Avoid email overflow
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    // Divider after each item
                                    Divider(
                                      color: Colors.grey
                                          .shade200, // Color for the divider
                                      thickness: 1, // Divider thickness
                                      // indent: 16, // Left padding for the divider
                                      // endIndent:
                                      //     16, // Right padding for the divider
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        )
                      ],
                    ),
                  ),
                  // Weekly Grid
                  Expanded(
                    child: Container(
                      // width: totalWidth + 4,
                      color: Colors.grey.shade100,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: StreamBuilder<List<JobsRecord>>(
                              stream: queryJobsRecord(
                                queryBuilder: (jobsRecord) => jobsRecord.where(
                                  'status',
                                  isEqualTo: JobStatus.Unassigned.serialize(),
                                ),
                              ),
                              builder: (context, snapshot) {
                                // Show a loading spinner while waiting for data
                                if (!snapshot.hasData) {
                                  return Center(
                                    child: SizedBox(
                                      width: 50,
                                      height: 50,
                                      child: CircularProgressIndicator(
                                        valueColor:
                                            AlwaysStoppedAnimation<Color>(
                                                Color(0xfa002aff)),
                                      ),
                                    ),
                                  );
                                }

                                List<JobsRecord> unassignedJobs =
                                    snapshot.data!;
                                double totalWidth =
                                    unassignedJobs.length * (dayWidth);
                                if (unassignedJobs.isEmpty) {
                                  return Container(
                                    height: 110, // fixed height as you want
                                    padding:
                                        EdgeInsets.symmetric(horizontal: 20),
                                    decoration: BoxDecoration(
                                      color: Colors.grey
                                          .shade100, // light background for subtle highlight
                                    ),
                                    child: Center(
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            Icons.work_outline,
                                            color: Colors.blueAccent,
                                            size: 28,
                                          ),
                                          SizedBox(width: 12),
                                          Flexible(
                                            child: Text(
                                              "Your new jobs will be shown here.",
                                              style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.w600,
                                                color: Colors.black87,
                                              ),
                                              textAlign: TextAlign.left,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }

                                // Dynamically calculate total width based on screen width and job count
                                // dayWidth + spacing

                                return SingleChildScrollView(
                                  scrollDirection: Axis.horizontal,
                                  child: Container(
                                    // Ensure it stretches to available space
                                    height:
                                        110, // Height of the container to hold job blocks
                                    decoration: BoxDecoration(
                                      border: Border(
                                        bottom: BorderSide(
                                          color: Colors
                                              .black45, // Same color as the Divider
                                          width: 1,
                                        ),
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment
                                          .start, // Align items to the left
                                      children: [
                                        // Loop through unassigned jobs and render each job block with spacing
                                        for (int i = 0;
                                            i < unassignedJobs.length;
                                            i++) ...[
                                          _buildUnassignedJobBlock(
                                              unassignedJobs[
                                                  i]), // Render job block
                                          SizedBox(
                                              width:
                                                  12), // Add 12px spacing between blocks
                                        ],
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),

                          // Header Days (Monday to Sunday)
                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Container(
                                width: totalWidth + 4,
                                color: Colors.grey.shade100,
                                child: Column(
                                  children: [
                                    Container(
                                      height: 40,
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        border: Border(
                                          top: BorderSide(
                                            color: Colors.grey.shade200,
                                            width: 2,
                                          ),
                                          bottom: BorderSide(
                                            color: Colors.grey.shade200,
                                            width: 3,
                                          ),
                                          left: BorderSide(
                                            color: Colors.grey.shade200,
                                            width: 2,
                                          ),
                                          right: BorderSide(
                                            color: Colors.grey.shade200,
                                            width: 2,
                                          ),
                                        ),
                                      ),
                                      child: Row(
                                        children:
                                            List.generate(daysInWeek, (i) {
                                          return Container(
                                            width: dayWidth,
                                            alignment: Alignment.center,
                                            decoration: BoxDecoration(
                                              border: Border(
                                                right: BorderSide(
                                                    color:
                                                        Colors.grey.shade300),
                                              ),
                                            ),
                                            child: Text(
                                              dayLabels[i],
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          );
                                        }),
                                      ),
                                    ),
                                    Expanded(
                                      child: ListView.builder(
                                        controller: jobListController,
                                        itemCount: technicians.length,
                                        itemBuilder: (context, techIndex) {
                                          final technician =
                                              technicians[techIndex];
                                          final techJobs = allJobs
                                              .where((job) =>
                                                  job.technician ==
                                                      technician.reference &&
                                                  job.status !=
                                                      JobStatus.Unassigned &&
                                                  job.status !=
                                                      JobStatus.Completed &&
                                                  job.requestedTime != null &&
                                                  job.requestedTime!.isAfter(
                                                      startOfWeek.subtract(
                                                          const Duration(
                                                              days: 1))) &&
                                                  job.requestedTime!.isBefore(
                                                      startOfWeek.add(
                                                          const Duration(
                                                              days: 7))))
                                              .toList();

                                          return Container(
                                            height: 110,
                                            decoration: BoxDecoration(
                                              border: Border(
                                                bottom: BorderSide(
                                                  color: Colors
                                                      .black45, // Same color as the Divider
                                                  width: 1,
                                                ),
                                              ),
                                            ),
                                            child: Stack(
                                              children: [
                                                // Background day columns
                                                Row(
                                                  children: List.generate(
                                                      daysInWeek, (i) {
                                                    return Container(
                                                      width: dayWidth,
                                                      decoration: BoxDecoration(
                                                        border: Border(
                                                          right: BorderSide(
                                                              color: Colors.grey
                                                                  .shade300),
                                                        ),
                                                      ),
                                                    );
                                                  }),
                                                ),

                                                // Job Cards
                                                ...techJobs.map((job) {
                                                  final jobDayIndex = job
                                                      .requestedTime!
                                                      .difference(startOfWeek)
                                                      .inDays;
                                                  return Positioned(
                                                    left:
                                                        jobDayIndex * dayWidth,
                                                    top: 5,
                                                    width: dayWidth,
                                                    height: 100,
                                                    child: jobMultipleHandleWidget(
                                                        context,
                                                        techJobs,
                                                        startOfWeek,
                                                        dayWidth,
                                                        job.status ==
                                                                JobStatus
                                                                    .Cancelled
                                                            ? Colors.red
                                                            : technician
                                                                    .color ??
                                                                Color(
                                                                    0xfa002aff)),
                                                  );
                                                }).toList(),
                                              ],
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildMonthlyJobCard(
      List<JobsRecord> jobs, double pixelsPerDay, DateTime date, Color color) {
    final jobCount = jobs.length;
    final double cardHeight = 100;

    return Positioned(
      left: (date.day - 1) * pixelsPerDay,
      top: 20.0,
      width: pixelsPerDay,
      height: cardHeight,
      child: GestureDetector(
        onTap: () {
          if (jobCount > 1) {
            _showJobListBottomSheet(
                context,
                jobs,
                jobs.any((element) => element.status == JobStatus.Pending)
                    ? const Color(0xFA75888F)
                    : color);
          } else {
            _handleJobTap(jobs[0]);
          }
        },
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            color: jobs.any((element) => element.status == JobStatus.Pending)
                ? Color(0xfa75888f)
                : color,
          ),
          child: Row(children:
                  //  jobCount > 1
                  //     ?
                  [
            // Main Job Card (75%)
            // Expanded(
            //   flex: 3,
            //   child: _buildStylishJobCard(jobs[0], color),
            // ),

            // const SizedBox(width: 4),
            // "+N" Indicator Card (25%)
            Expanded(
              // flex: 1,
              child: Container(
                  height: double.infinity,
                  decoration: BoxDecoration(
                    color: jobs.any(
                            (element) => element.status == JobStatus.Pending)
                        ? Color(0xfa75888f)
                        : color,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: Container(
                    height:
                        40, // Define the height (you can adjust this based on your needs)
                    width:
                        40, // Define the width to make it circular (can be adjusted based on your needs)
                    decoration: BoxDecoration(
                      color: Colors.transparent, // No fill color
                      borderRadius: BorderRadius.circular(50), // Circular shape
                      border: Border.all(
                        color: Colors.white, // White border color
                        width: 2, // Border width
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '+${jobCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  )),
            ),
          ]
              // : [
              //     // Full-width card for a single job
              //     Expanded(
              //       child: _buildStylishJobCard(jobs[0], color),
              //     ),
              //   ],
              ),
        ),
      ),
    );
  }

  Widget _buildStylishJobCard(JobsRecord job, Color? color) {
    String numStr = job.uniqueJobId.toString();
    String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);
    return Container(
      height: double.infinity,
      decoration: BoxDecoration(
        color: color ?? Color(0xfa002aff),
        // color: _statusToColor(job.status),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '#${number}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 4),
          Text(
            job.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
          SizedBox(height: 4),
          Row(children: [
            RoundContainer(
              context: context,
              value: job.status?.name ?? '',
            ),
            SizedBox(width: 4),
            RoundContainer(
              context: context,
              value: job.priotity?.name ?? '',
            ),
          ])
        ],
      ),
    );
  }

// Function to build stylish job card for unassigned jobs
  Widget _buildStylishUnassignedJobCard(JobsRecord job, Color? color) {
    String numStr = job.uniqueJobId.toString();
    String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);
    return Container(
      height: double.infinity,
      decoration: BoxDecoration(
        color: color ??
            Color(0xfa75888f), // Color for unassigned jobs, can be customized
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '#${number}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 4),
          Text(
            job.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 13,
            ),
          ),
          SizedBox(height: 4),
          RoundContainer(
            context: context,
            value: job.status?.name ?? '',
          ),
          SizedBox(height: 4),
          RoundContainer(
            context: context,
            value: job.priotity?.name ?? '',
          ),
        ],
      ),
    );
  }

  void _showJobListBottomSheet(
      BuildContext context, List<JobsRecord> jobs, Color? color) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (BuildContext context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.25, // Reduced initial size
          minChildSize: 0.25, // Adjusted min size
          maxChildSize: 0.7, // Adjusted max size
          builder: (_, controller) => Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(24),
                topRight: Radius.circular(24),
              ),
            ),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Drag handle
                Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      SizedBox(),
                      Container(
                        width: 40,
                        height: 5,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(context); // Dismiss the bottom sheet
                        },
                        child: Text(
                          'Cancel',
                          style: TextStyle(
                            color: Colors.blue,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ]),
                // Single row of smaller job cards (horizontal scroll)
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      mainAxisAlignment:
                          MainAxisAlignment.start, // Left-aligned items
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: List.generate(jobs.length, (index) {
                        final job = jobs[index];
                        return Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: _buildJobCard(
                              job, color), // Create smaller job cards
                        );
                      }),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildJobCard(JobsRecord job, Color? color) {
    // Format the job time
    final formattedTime = DateFormat('hh:mm a').format(job.requestedTime!);
    final formattedEndTime = (job.endRequestedTime != null)
        ? DateFormat('hh:mm a').format(job.endRequestedTime!)
        : null;
    String numStr = job.uniqueJobId.toString();
    String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);
    return GestureDetector(
        onTap: () {
          widget.onJobTap(job);
        },
        child: Container(
          width: 180, // Reduced width for smaller cards
          height: 130, // Reduced height to fit the layout like the second image
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color ?? Color(0xfa002aff), // Example color for job card
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '#${number}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 4),
              Text(
                job.title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  fontSize: 14,
                ),
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis, // Avoid overflow
              ),
              SizedBox(height: 4),
              Row(children: [
                Text(
                  formattedTime, // Show the formatted time
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                  ),
                ),
                if (formattedEndTime != null)
                  Text(
                    " - ", // Show the formatted time
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 12,
                    ),
                  ),
                Text(
                  formattedEndTime ?? "", // Show the formatted time
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                  ),
                )
              ]),
              SizedBox(height: 6),
              // Adding job status as a subtitle (optional)
              Row(children: [
                RoundContainer(
                  context: context,
                  value: job.status?.name ?? '',
                ),
                SizedBox(width: 4),
                RoundContainer(
                  context: context,
                  value: job.priotity?.name ?? '',
                ),
              ])
            ],
          ),
        ));
  }

// Callback function when a job is clicked
  void _handleJobTap(JobsRecord job) {
    // Handle the job tap, for example, show a detailed screen or perform an action
    print("Job Selected: ${job.title}");
    widget.onJobTap(job);
    // You can add your desired callback functionality here, for example, navigating to a job details screen
  }

  Widget _buildTimelineHeader() {
    final hourCount = endHour - startHour;

    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(
            color: Colors.grey.shade300,
            width: 1,
          ),
          bottom: BorderSide(
            color: Colors.grey.shade300,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: List.generate(hourCount, (i) {
          final hour24 = startHour + i;
          final hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
          final period = hour24 < 12 ? 'AM' : 'PM';

          return Expanded(
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border(
                  right: BorderSide(color: Colors.grey.shade300),
                ),
              ),
              child: Text(
                '$hour12 $period',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: Colors.black87,
                ),
                overflow: TextOverflow.ellipsis, // Avoid overflow
                textAlign: TextAlign.center,
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildTechnicianRow(
      TechnicianRecord technician, List<JobsRecord> jobs) {
    final hourCount = endHour - startHour;
    return Container(
      height: 110,
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Colors.black45, // Same color as the Divider
            width: 1,
          ),
        ),
      ),
      child: Stack(
        children: [
          Row(
            children: List.generate(hourCount, (i) {
              return Container(
                width: pixelsPerHour,
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: Colors.grey.shade300),
                  ),
                ),
              );
            }),
          ),
          for (final job in jobs)
            _buildJobBlock(
                job,
                job.status == JobStatus.Pending
                    ? Color(0xFA75888F)
                    : job.status == JobStatus.Cancelled
                        ? Colors.red
                        : technician.color),
        ],
      ),
    );
  }

  Widget _buildJobBlock(JobsRecord job, Color? color) {
    final startTime = job.requestedTime ?? DateTime.now();
    final endTime =
        job.endRequestedTime ?? startTime.add(const Duration(hours: 2));

// Calculate left position
    final startHourFraction = startTime.hour + (startTime.minute / 60);
    final leftPx = (startHourFraction - startHour) * pixelsPerHour;

// Calculate width
    final endHourFraction = endTime.hour + (endTime.minute / 60);
    final durationHours = endHourFraction - startHourFraction;
    final widthPx = durationHours * pixelsPerHour;

// Check bounds (if completely outside)
    if (endHourFraction <= startHour || startHourFraction >= endHour) {
      return const SizedBox();
    }

// Bound adjustments if needed (optional)
    final adjustedLeft = leftPx < 0 ? 0.0 : leftPx;
    final adjustedWidth = (adjustedLeft + widthPx) > timelineWidth
        ? timelineWidth - adjustedLeft
        : widthPx;
    String numStr = job.uniqueJobId.toString();
    String number = numStr.length <= 5 ? numStr : numStr.substring(0, 5);
    bool isPriorityShow = checkHalfHourInterval(startTime, endTime);
    return Positioned(
      left: leftPx,
      top: 5,
      width: adjustedWidth,
      height: 100,
      child: GestureDetector(
        onTap: () {
          widget.onJobTap(job);
        },
        child: Container(
          decoration: BoxDecoration(
            color: color ?? Color(0xfa002aff),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '#${number}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 4),
              Text(
                job.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 4),
              Row(children: [
                RoundContainer(
                  context: context,
                  value: job.status?.name ?? '',
                ),
                if (isPriorityShow) ...[
                  SizedBox(width: 4),
                  RoundContainer(
                    context: context,
                    value: job.priotity?.name ?? '',
                  ),
                ]
              ])
            ],
          ),
        ),
      ),
    );
  }

  Color _statusToColor(JobStatus? status) {
    switch (status) {
      case JobStatus.Completed:
        return Colors.green;
      case JobStatus.Inprogress:
        return Colors.orange;
      case JobStatus.Pending:
        return Color(0xfa002aff);
      case JobStatus.Unassigned:
        return Color(0xfa75888f);
      default:
        return Colors.grey;
    }
  }
}

class RoundContainer extends StatelessWidget {
  final String value;
  const RoundContainer({
    super.key,
    required this.context,
    required this.value,
  });

  final BuildContext context;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: [
        Container(
          height: 30,
          width: 80,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(889),
            border: Border.all(
              color: FlutterFlowTheme.of(context).alternate,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(3.0),
            child: Align(
              alignment: AlignmentDirectional(0, 0),
              child: Text(
                value,
                style: FlutterFlowTheme.of(context).labelLarge.override(
                      font: GoogleFonts.inter(
                        fontWeight: FontWeight.w500,
                        fontStyle:
                            FlutterFlowTheme.of(context).labelLarge.fontStyle,
                      ),
                      color: FlutterFlowTheme.of(context).secondaryBackground,
                      fontSize: 12,
                      letterSpacing: 0.0,
                      fontWeight: FontWeight.w500,
                      fontStyle:
                          FlutterFlowTheme.of(context).labelLarge.fontStyle,
                    ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
