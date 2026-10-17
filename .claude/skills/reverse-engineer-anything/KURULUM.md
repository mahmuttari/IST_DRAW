# REA (Reverse Engineer Anything) skill'i

Bu depoya, kaynak kodu elimizde olmayan yazılımları incelemek için **REA** skill'i eklendi.
Skill, Claude Code'un proje kapsamındaki skill klasöründedir:
`.claude/skills/reverse-engineer-anything/`. Aynı skill, mahmuttari hesabındaki bütün depolara aynı
içerikle konuldu; bu belge her depoda `KURULUM.md` adıyla skill klasörünün içindedir.

## Kaynak ve lisans

| Alan | Değer |
|---|---|
| Proje | REA: Reverse Engineer Anything (morluto/rea), https://github.com/morluto/rea |
| Alınan commit | `73965f9431eb64e6386949d308e67d629829796b` (17 Ekim 2026) |
| Skill sürümü | SKILL.md `metadata.version: "42"` |
| npm paketi | `rea-agents` 6.5.0 (`latest`, 14 Ekim 2026) |
| Lisans | MIT; metin aynı klasördeki `LICENSE` dosyasında |
| Resmî kaynaklar | github.com/morluto/rea, rea.tools, npm `rea-agents`. Benzer adlı kopya depolar resmî değildir. |

Skill klasörü kaynak depodaki `.agents/skills/reverse-engineer-anything/` klasörünün **değiştirilmemiş
kopyasıdır**: `SKILL.md` ve altı başvuru dosyası (`references/`). Yalnız LICENSE ve bu belge eklendi.

## Ne işe yarar

REA bir MCP sunucusudur. Claude'a şu hedefleri inceleme araçları verir ve her sonucu kanıt
kaydıyla (Evidence ID, sınırlamalar, bilinmeyenler) döndürür:

- **Yerel ikili dosyalar** (EXE, DLL, ELF, Mach-O): sözde kod, assembly, dizgeler, çağrı grafiği.
  Ghidra, Hopper ya da IDA kurulu olmalıdır.
- **Electron / JavaScript uygulamaları** (ASAR, paketlenmiş JS): modüller, içe aktarmalar, IPC
  sınırları, kaynak haritaları. Ek araç gerekmez.
- **.NET derlemeleri**: üst veri, CIL, sürüm karşılaştırması. Ek araç gerekmez.
- **Android APK**: bildirim, sınıflar, kaynak koda çevrilmiş yöntemler (JADX + JDK gerekir).
- **Web sayfaları ve tarayıcı senaryoları**, HAR/SAZ ağ kayıtları, PCAP paket kayıtları,
  firmware (Binwalk/Unblob), WebAssembly, SQLite dosyaları, Go ve Rust ikili üst verisi.

Kaynak deposu elimizde olan sıradan bir projenin mimarisini incelemek için REA kullanılmaz;
skill bunu kendi metninde söyler.

**Netcad/AutoCAD eklentileri ve DWG araçlarıyla ilgisi:** `NetcadDevelop`, `Lispler`,
`dwgofficezip-web` gibi işlerde, davranışı belgelenmemiş bir ikili dosyanın ya da bir Electron
uygulamasının nasıl çalıştığını anlamak gerektiğinde REA ile kanıtlı inceleme yapılabilir.

## Hukuki çerçeve

Kaynak deponun `DISCLAIMER.md` dosyası bağlayıcıdır. REA yalnız **sahibi olduğumuz ya da inceleme
yetkimiz bulunan** yazılımlar için kullanılır: güvenlik araştırması, hata ayıklama, birlikte
çalışabilirlik, eğitim. Şunlar için kullanılmaz: DRM ve lisans denetimini aşma, oyun hilesi,
yetkisiz sistemlere erişim, korumalı kodun kopyalanması. Bir dosyaya sahip olmak, onu çalıştırma ya
da ağ trafiğini yakalama izni anlamına gelmez; çalışma zamanı araçları hedefi gerçekten çalıştırır.

## Güvenlik taraması (skillspector 2.12.0, `--no-llm`)

Kurulumdan önce skill klasörü tarandı. Sonuç: **40/100, MEDIUM, "CAUTION"**. 7 dosya, hiçbiri
çalıştırılabilir değil. 12 bulgu:

| Kod | Adet | Açıklama | Değerlendirme |
|---|---|---|---|
| RP1 | 5 | `npx -y rea-agents@latest` sürüm sabitlenmemiş çağrı | Gerçek risk. Bu yüzden MCP kaydı aşağıda **6.5.0'a sabitlenir**; `@latest` kullanılmaz. |
| RA2 | 5 | "Oturum kalıcılığı" (native-and-artifacts.md:236) | Yanlış pozitif: Ghidra analiz veritabanının diskte saklanmasını anlatan metin. |
| MP2 | 1 | "Bağlam penceresi doldurma" (connection-and-recovery.md:14) | Yanlış pozitif: kılavuzun yalnız gerektiğinde okunmasını isteyen cümle. |
| EA2 | 1 | "Özerk karar" (native-and-artifacts.md:255) | Düşük: skill'in kendisi yapılandırma değişikliğinden önce onay ister. |

Tarama çıktısı skill'de hiçbir betik, gizli komut ya da veri sızdırma kalıbı bulmadı. Tek önemli
nokta, skill'in `npx` ile npm'den paket indirip çalıştırmasıdır; bu, aşağıdaki kayıtta sürüm
sabitlenerek karşılanır.

## MCP sunucusunu kaydetme (kullanıcı yapar)

Skill dosyası yalnız talimat verir; REA araçlarının görünmesi için MCP sunucusunun kaydedilmesi
gerekir. Bu kayıt **bilerek depoya konmadı**: `.mcp.json` dosyası, depoyu açan her Claude Code
oturumunun npm'den paket indirip çalıştırmasını ister. Kararı kullanıcı verir. Üç yol vardır:

**1. Yalnız bu proje** (önerilen; depo klasöründe, `CLAUDE_CONFIG_DIR` tanımsızken):

```bash
claude mcp add --scope local rea -- npx -y rea-agents@6.5.0 mcp
```

**2. Depoyla paylaşılan kayıt**: depo köküne şu `.mcp.json` dosyası konur. Claude Code ilk açılışta
onay ister.

```json
{
  "mcpServers": {
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents@6.5.0", "mcp"]
    }
  }
}
```

**3. Bütün projeler** (kullanıcı düzeyi; `~/.claude.json`'a yazar ve skill'i `~/.claude/skills`'e
de kurar):

```bash
npx -y rea-agents@6.5.0 setup --client claude_code --dry-run
```

Önce `--dry-run` çıktısı okunur; uygunsa aynı komut `--dry-run` yerine `--yes` ile çalıştırılır.
Windows'ta komut `cmd.exe /d /c npx -y rea-agents@6.5.0 mcp` biçiminde sarılır.

Kayıttan sonra Claude Code yeniden başlatılır. Durum denetimi:

```bash
npx -y rea-agents@6.5.0 doctor --client claude_code --json
```

## Gereksinimler

- Node.js 22.x (≥ 22.19), 24.x (≥ 24.11) ya da 26+ ve npm. Linux'ta `ps` (procps) bulunmalıdır.
- Yerel ikili analizi için Ghidra, Hopper ya da IDA; APK için JADX + JDK; firmware için Binwalk/Unblob.
  REA kurulumu bunların hiçbirini kendisi kurmaz (Hopper hariç, yalnız açık onayla).
- JavaScript/Electron ve .NET analizi ek araç istemez.

## Kullanım örneği

```text
D:/uygulamalar/ornek klasöründeki Electron uygulamasında "dışa aktar" özelliğinin nasıl
çalıştığını REA ile incele, kanıtları göster, bilinmeyenleri ayrı yaz.
```

MCP kaydı olmadan da yalnız JavaScript ağacı için komut satırı yolu vardır:

```bash
npx -y rea-agents@6.5.0 analyze-javascript-application /mutlak/yol/uygulama --json
```

## Güncelleme

1. Kaynak depodan `.agents/skills/reverse-engineer-anything/` klasörü yeniden kopyalanır
   (`git clone --depth 1 https://github.com/morluto/rea.git`), LICENSE korunur.
2. `skillspector scan .claude/skills/reverse-engineer-anything --no-llm` yeniden çalıştırılır;
   sonuç bu dosyaya işlenir.
3. Bu dosyadaki commit, skill sürümü ve npm sürümü güncellenir; MCP kaydındaki sürüm de aynı
   sürüme çekilir (`claude mcp remove --scope local rea` sonra yeniden `add`).

## Bulut oturumu notu (17 Ekim 2026)

Skill ilk olarak GENEL-KONULAR deposuna eklendi, sonra kullanıcının isteğiyle bütün depolara
kopyalandı. Bulut ortamında `npx rea-agents … --dry-run` ve `.mcp.json` yazımı, dış koddan kaynaklı
işlem sayıldığı için izin sınıflandırıcısı tarafından engellendi. Skill dosyaları ve bu belge eklendi;
MCP kaydı kullanıcının kendi makinesinde yukarıdaki komutlarla yapılır.
