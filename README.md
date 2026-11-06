# 👑 ROYAL ELITE X (REX)

**Premium Jetton Token on the TON Blockchain**

| خاصية | قيمة |
|---------|-------|
| الاسم | ROYAL ELITE X |
| الرمز | REX |
| الكمية الإجمالية | 1,000,000 REX |
| الفاصلة العشرية | 9 |
| الشبكة | TON Blockchain |
| المعيار | TEP-74 (Jetton) |

---

## 🚀 البدء السريع

### المتطلبات
- [Node.js](https://nodejs.org) v18 أو أحدث
- محفظة TON (مثل [Tonkeeper](https://tonkeeper.com))
- رصيد TON للنشر (حوالي 0.5 TON على الـ testnet)

### التثبيت

```bash
# 1. تثبيت الحزم
npm install

# 2. بناء العقود الذكية
npm run build

# 3. تشغيل الاختبارات
npm test
```

### النشر على Testnet (للتجربة)

```bash
# 1. انسخ ملف البيئة
cp .env.example .env

# 2. افتح .env وضع فيه:
#    - المنيمونيك بتاعت محفظتك (24 كلمة)
#    - API Key من @tonapibot على تيليجرام

# 3. انشر على الـ testnet
npm run deploy:testnet
```

### النشر على Mainnet (الشبكة الحقيقية)

```bash
# غير في blueprint.config.ts:
# endpoint: 'https://toncenter.com/api/v2/jsonRPC'
# type: 'mainnet'

npm run deploy
```

---

## 📁 هيكل المشروع

```
royal-elite-x/
├── contracts/
│   ├── jetton_minter.tact    # العقد الرئيسي (Master)
│   └── jetton_wallet.tact    # عقد المحفظة
├── wrappers/
│   ├── JettonMinter.ts       # واجهة TypeScript
│   └── JettonWallet.ts       # واجهة TypeScript
├── scripts/
│   └── deployJetton.ts       # سكريبت النشر
├── tests/
│   └── jetton.spec.ts        # اختبارات الوحدة
├── .env.example              # مثال متغيرات البيئة
└── blueprint.config.ts       # إعدادات Blueprint
```

---

## 🔧 الوظائف المتاحة

### للمالك (Owner)
| الوظيفة | الوصف |
|---------|-------|
| `Mint` | سك عملات REX جديدة |
| `Disable minting` | إيقاف السك نهائياً (لا رجعة!) |

### للجميع
| الوظيفة | الوصف |
|---------|-------|
| `JettonTransfer` | إرسال REX لعنوان آخر |
| `JettonBurn` | حرق عملات REX (تقليل العرض) |

---

## 🔍 مشاهدة العملة

بعد النشر، يمكنك مشاهدة عملتك على:
- **Testnet**: https://testnet.tonviewer.com
- **Mainnet**: https://tonviewer.com

---

## ⚠️ تنبيهات مهمة

1. **احفظ المنيمونيك** في مكان آمن - فقدانها = فقدان كل شيء
2. **جرب على Testnet أولاً** قبل الانتقال للـ Mainnet
3. **الـ Testnet** مجاني - احصل على TON من [@testgiver_ton_bot](https://t.me/testgiver_ton_bot)
4. **الـ Mainnet** يحتاج TON حقيقي للرسوم

---

## 📞 الدعم

للحصول على TON للاختبار (مجاني):
- تيليجرام: [@testgiver_ton_bot](https://t.me/testgiver_ton_bot)

للحصول على API Key:
- تيليجرام: [@tonapibot](https://t.me/tonapibot)
