
def analyze_string(text):
    print(f"Analyzing: {text}")
    for char in text:
        import unicodedata
        try:
            name = unicodedata.name(char)
        except:
            name = "UNKNOWN"
        print(f"  {char} (U+{ord(char):04X}): {name}")

s1 = '影片播放器將被封鎖'
s2 = '视频播放器将被封锁'

analyze_string(s1)
analyze_string(s2)
