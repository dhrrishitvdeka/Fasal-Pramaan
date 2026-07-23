import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/core/widgets/shimmer_loading.dart';
import 'package:fasalpramaan/core/widgets/fade_slide_transition.dart';

class FarmsScreen extends ConsumerStatefulWidget {
  const FarmsScreen({super.key});
  @override
  ConsumerState<FarmsScreen> createState() => _FarmsScreenState();
}

class _FarmsScreenState extends ConsumerState<FarmsScreen> {
  final api = ApiClient();
  final offline = OfflineDb();
  List<dynamic> farms = [];
  List<dynamic> cycles = [];
  List<dynamic> crops = [];
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      farms = await api.farms();
      cycles = await api.cropCycles();
      crops = await api.crops();
      for (final f in farms) {
        await offline.upsertFarm(
            f['id'].toString(), Map<String, dynamic>.from(f as Map));
      }
      for (final c in cycles) {
        await offline.upsertCycle(
            c['id'].toString(), Map<String, dynamic>.from(c as Map));
      }
    } catch (e) {
      farms = await offline.listCachedFarms();
      cycles = await offline.listCachedCycles();
      error = 'Offline Mode: Displaying recently cached farms and crop cycles.';
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _createFarmDialog() async {
    final s = S.of(ref);
    final isHi = s.isHi;
    final nameCtrl = TextEditingController();
    final areaCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        actionsPadding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        title: Row(
          children: [
            const Icon(Icons.add_location_alt_rounded,
                color: Color(0xFF064E3B), size: 26),
            const SizedBox(width: 12),
            Text(
              isHi ? 'नया खेत पंजीकृत करें' : 'Register New Farm',
              style: const TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 4),
              TextField(
                controller: nameCtrl,
                decoration: InputDecoration(
                  labelText: isHi ? 'खेत का नाम' : 'Farm Name',
                  prefixIcon: const Icon(Icons.landscape_rounded),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: areaCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: isHi ? 'कुल क्षेत्रफल (हेक्टेयर)' : 'Total Area (Hectares)',
                  prefixIcon: const Icon(Icons.square_foot_rounded),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
        actions: [
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(90, 44),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(s.cancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(110, 44),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isHi ? 'खेत बनाएं' : 'Create Farm'),
          ),
        ],
      ),
    );

    if (ok != true) return;
    try {
      final farm = await api.createFarm(
        name: nameCtrl.text.trim(),
        totalAreaHectares: double.tryParse(areaCtrl.text),
      );
      await offline.upsertFarm(farm['id'].toString(), farm);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isHi ? 'खेत निर्मित: ${farm['name']}' : 'Farm created: ${farm['name']}'),
          backgroundColor: const Color(0xFF059669),
        ),
      );
      await _load();
      await _createPlotDialog(farm['id'].toString());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Farm creation failed: $e')),
      );
    }
  }

  Future<void> _createPlotDialog(String farmId) async {
    final s = S.of(ref);
    final isHi = s.isHi;
    final nameCtrl = TextEditingController();
    final latCtrl = TextEditingController();
    final lonCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        actionsPadding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        title: Row(
          children: [
            const Icon(Icons.grid_view_rounded,
                color: Color(0xFF064E3B), size: 26),
            const SizedBox(width: 12),
            Text(
              isHi ? 'प्लॉट सीमा जोड़ें' : 'Add Plot Boundary',
              style: const TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 4),
              TextField(
                controller: nameCtrl,
                decoration: InputDecoration(
                  labelText: isHi ? 'प्लॉट का नाम' : 'Plot Name',
                  prefixIcon: const Icon(Icons.grid_on_rounded),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: latCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: isHi ? 'अक्षांश (Centroid Latitude)' : 'Centroid Latitude',
                  prefixIcon: const Icon(Icons.my_location_rounded),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: lonCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: isHi ? 'देशांतर (Centroid Longitude)' : 'Centroid Longitude',
                  prefixIcon: const Icon(Icons.location_on_rounded),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
        actions: [
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(90, 44),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(s.cancel),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(110, 44),
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(isHi ? 'प्लॉट बनाएं' : 'Create Plot'),
          ),
        ],
      ),
    );

    if (ok != true) return;
    final lat = double.tryParse(latCtrl.text) ?? 23.2615;
    final lon = double.tryParse(lonCtrl.text) ?? 77.4125;
    const delta = 0.001;

    try {
      final plot = await api.createPlot(
        farmId: farmId,
        name: nameCtrl.text.trim().isEmpty ? 'Plot 1' : nameCtrl.text.trim(),
        areaHectares: 1.0,
        centroidLat: lat,
        centroidLon: lon,
        boundaryCoords: [
          [lon - delta, lat - delta],
          [lon + delta, lat - delta],
          [lon + delta, lat + delta],
          [lon - delta, lat + delta],
          [lon - delta, lat - delta],
        ],
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isHi ? 'प्लॉट निर्मित: ${plot['name']}' : 'Plot created: ${plot['name']}'),
          backgroundColor: const Color(0xFF059669),
        ),
      );
      await _createCycleDialog(plot['id'].toString());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Plot creation failed: $e')),
      );
    }
  }

  Future<void> _createCycleDialog(String plotId) async {
    final s = S.of(ref);
    final isHi = s.isHi;
    if (crops.isEmpty) {
      try {
        crops = await api.crops();
      } catch (_) {}
    }
    if (crops.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No crop types available. Seed the database first.'),
        ),
      );
      return;
    }
    if (!mounted) return;
    String cropId = crops.first['id'].toString();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          titlePadding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
          contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          actionsPadding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
          title: Row(
            children: [
              const Icon(Icons.eco_rounded, color: Color(0xFF064E3B), size: 26),
              const SizedBox(width: 12),
              Text(
                isHi ? 'फसल चक्र शुरू करें' : 'Start Crop Cycle',
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  initialValue: cropId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: isHi ? 'फसल का प्रकार' : 'Crop Type',
                    prefixIcon: const Icon(Icons.grass_rounded),
                  ),
                  items: crops
                      .map(
                        (c) => DropdownMenuItem(
                          value: c['id'].toString(),
                          child: Text(
                            '${c['name']} (${c['code']})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setLocal(() => cropId = v!),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          actions: [
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(90, 44),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(s.cancel),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(110, 44),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(isHi ? 'चक्र शुरू करें' : 'Start Cycle'),
            ),
          ],
        ),
      ),
    );

    if (ok != true) return;
    try {
      final cycle = await api.createCropCycle(
        plotId: plotId,
        cropTypeId: cropId,
        seasonYear: DateTime.now().year,
        season: 'kharif',
      );
      await offline.upsertCycle(cycle['id'].toString(), cycle);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isHi
              ? 'फसल चक्र निर्मित'
              : 'Crop cycle created: ${cycle['id'].toString().substring(0, 8)}…'),
          backgroundColor: const Color(0xFF059669),
        ),
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cycle creation failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(ref);
    final isHi = s.isHi;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.farms),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _load,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createFarmDialog,
        backgroundColor: const Color(0xFF064E3B),
        foregroundColor: Colors.white,
        elevation: 4,
        label: Text(s.addFarm),
        icon: const Icon(Icons.add_rounded),
      ),
      body: loading
          ? const SkeletonListLoader(count: 4)
          : RefreshIndicator(
              onRefresh: _load,
              child: FadeSlideTransition(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    if (error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFF59E0B)),
                        ),
                        child: Text(
                          error!,
                          style: const TextStyle(
                            color: Color(0xFF92400E),
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Farms Section Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          s.registeredFarms,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        Text(
                          '${farms.length} ${isHi ? 'कुल' : 'Total'}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF059669),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    if (farms.isEmpty)
                      _buildEmptyCard(isHi
                          ? 'कोई खेत पंजीकृत नहीं है। जोड़ने के लिए "+ नया खेत जोड़ें" दबाएं।'
                          : 'No farms registered yet. Tap "+ Add Farm" to create one.')
                    else
                      ...farms.map(
                        (f) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.02),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFECFDF5),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: const Icon(Icons.agriculture_rounded,
                                      color: Color(0xFF064E3B), size: 28),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${f['name']}',
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF0F172A),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${isHi ? 'क्षेत्रफल' : 'Area'}: ${f['total_area_hectares'] ?? '—'} ha',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: Color(0xFF64748B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    minimumSize: const Size(100, 38),
                                    padding: const EdgeInsets.symmetric(horizontal: 10),
                                  ),
                                  icon: const Icon(Icons.add_location_alt_rounded, size: 16),
                                  label: Text(s.addPlot, style: const TextStyle(fontSize: 12)),
                                  onPressed: () => _createPlotDialog(f['id'].toString()),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),

                    const SizedBox(height: 24),

                    // Crop Cycles Section Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          s.activeCropCycles,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        Text(
                          '${cycles.length} ${isHi ? 'सक्रिय' : 'Active'}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF059669),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    if (cycles.isEmpty)
                      _buildEmptyCard(isHi ? 'कोई सक्रिय फसल चक्र नहीं मिला।' : 'No active crop cycles found.')
                    else
                      ...cycles.map(
                        (c) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: const Color(0xFFE2E8F0)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.02),
                                  blurRadius: 8,
                                  offset: const Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF0FDF4),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: const Icon(Icons.eco_rounded,
                                      color: Color(0xFF16A34A), size: 26),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Season ${c['season']?.toString().toUpperCase()} ${c['season_year']}',
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                          color: Color(0xFF0F172A),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Status: ${c['status']} · Plot ${c['plot_id'].toString().substring(0, 8)}…',
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: Color(0xFF64748B),
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
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildEmptyCard(String message) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Center(
        child: Text(
          message,
          style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
