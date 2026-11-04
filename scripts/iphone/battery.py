# The iPhone's own power draw, read over USB from its battery gauge
# (AppleSmartBattery's PowerTelemetryData) through the libimobiledevice the
# inspector proxy brought (docs/iphone.md, "Measuring on iOS"): a line of
# JSON every `every_s` seconds. `load` is the whole phone's draw in mW,
# screen included; the gauge updates it every 20 s or so (`upd`). Over a
# window, the mean is the change in `accLoad` over the change in `n` (one a
# second).
#   python -I scripts/iphone/battery.py <seconds> <every_s>
import ctypes, os, plistlib, json, sys, time
d = os.path.join(os.environ['LOCALAPPDATA'], 'ios-webkit-debug-proxy')
os.add_dll_directory(d)
imd = ctypes.CDLL(os.path.join(d, 'libimobiledevice-1.0.dll')); pl = ctypes.CDLL(os.path.join(d, 'libplist-2.0.dll'))
vp = ctypes.c_void_p
def read():
    dev = vp(); assert imd.idevice_new(ctypes.byref(dev), None) == 0
    diag = vp(); assert imd.diagnostics_relay_client_start_service(dev, ctypes.byref(diag), b'poe2-battery') == 0
    node = vp(); ok = imd.diagnostics_relay_query_ioregistry_entry(diag, b'AppleSmartBattery', b'', ctypes.byref(node)) == 0 and node.value
    xml = ctypes.c_void_p(); n = ctypes.c_uint32()
    if ok: pl.plist_to_xml(node, ctypes.byref(xml), ctypes.byref(n))
    imd.diagnostics_relay_goodbye(diag); imd.diagnostics_relay_client_free(diag); imd.idevice_free(dev)
    # (A query that fails leaves no plist: reading it would crash the interpreter, not raise.)
    assert ok and xml.value, 'the battery gauge did not answer (phone locked, or not trusted?)'
    data = ctypes.string_at(xml.value, n.value)
    (getattr(pl, 'plist_mem_free', None) or pl.plist_to_xml_free)(xml); pl.plist_free(node)
    b = plistlib.loads(data); b = b.get('IORegistry', b)
    t = b['PowerTelemetryData']
    return {'t': round(time.time(), 1), 'upd': b.get('UpdateTime'), 'load': t['SystemLoad'], 'accLoad': t['AccumulatedSystemLoad'], 'n': t['SystemLoadAccumulatorCount'], 'energy': t['AccumulatedSystemEnergyConsumed'], 'cap': b.get('CurrentCapacity'), 'charging': b.get('IsCharging')}
secs, every = float(sys.argv[1]), float(sys.argv[2])
end = time.time() + secs
while time.time() < end:
    print(json.dumps(read()), flush=True)
    time.sleep(every)
