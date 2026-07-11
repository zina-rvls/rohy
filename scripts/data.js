/**
 * Liste des devises proposées à la création d'un groupe. Les personnes
 * viennent désormais de Supabase (table `profiles`) — plus de données de
 * départ statiques pour les comptes.
 */
(function (root) {
  'use strict';

  // `decimals` : nombre de décimales généralement affichées pour cette
  // devise (0 pour les devises dont la plus petite subdivision n'est en
  // pratique jamais utilisée au quotidien, ex. la plupart des francs
  // africains — cf. fmtIn dans app.js). `region` : regroupement utilisé
  // pour organiser le sélecteur de devise en catégories (cf. optgroup dans
  // renderAddGroupModal, scripts/app.js) plutôt qu'une seule longue liste
  // à plat.
  var REGION_AFRICA = 'Devises africaines';
  var REGION_EUROPE = 'Europe';
  var REGION_AMERICAS = 'Amérique';
  var REGION_ASIA = 'Asie';
  var REGION_MIDDLE_EAST = 'Moyen-Orient';
  var REGION_OCEANIA = 'Océanie';
  var CURRENCIES = [
    // Devises africaines (public cible principal de l'app) — Ariary
    // malgache en tête de liste, devant les autres devises africaines.
    { code: 'MGA', label: 'Ariary malgache', symbol: 'Ar', decimals: 0, region: REGION_AFRICA },
    { code: 'XOF', label: 'Franc CFA (UEMOA)', symbol: 'FCFA', decimals: 0, region: REGION_AFRICA },
    { code: 'XAF', label: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0, region: REGION_AFRICA },
    { code: 'GNF', label: 'Franc guinéen', symbol: 'FG', decimals: 0, region: REGION_AFRICA },
    { code: 'RWF', label: 'Franc rwandais', symbol: 'FRw', decimals: 0, region: REGION_AFRICA },
    { code: 'BIF', label: 'Franc burundais', symbol: 'FBu', decimals: 0, region: REGION_AFRICA },
    { code: 'KMF', label: 'Franc comorien', symbol: 'CF', decimals: 0, region: REGION_AFRICA },
    { code: 'DJF', label: 'Franc djiboutien', symbol: 'Fdj', decimals: 0, region: REGION_AFRICA },
    { code: 'CDF', label: 'Franc congolais', symbol: 'FC', decimals: 2, region: REGION_AFRICA },
    { code: 'UGX', label: 'Shilling ougandais', symbol: 'USh', decimals: 0, region: REGION_AFRICA },
    { code: 'KES', label: 'Shilling kényan', symbol: 'KSh', decimals: 2, region: REGION_AFRICA },
    { code: 'TZS', label: 'Shilling tanzanien', symbol: 'TSh', decimals: 2, region: REGION_AFRICA },
    { code: 'ETB', label: 'Birr éthiopien', symbol: 'Br', decimals: 2, region: REGION_AFRICA },
    { code: 'NGN', label: 'Naira nigérian', symbol: '₦', decimals: 2, region: REGION_AFRICA },
    { code: 'GHS', label: 'Cedi ghanéen', symbol: 'GH₵', decimals: 2, region: REGION_AFRICA },
    { code: 'GMD', label: 'Dalasi gambien', symbol: 'D', decimals: 2, region: REGION_AFRICA },
    { code: 'LRD', label: 'Dollar libérien', symbol: 'L$', decimals: 2, region: REGION_AFRICA },
    { code: 'SLE', label: 'Leone sierra-léonais', symbol: 'Le', decimals: 2, region: REGION_AFRICA },
    { code: 'MAD', label: 'Dirham marocain', symbol: 'DH', decimals: 2, region: REGION_AFRICA },
    { code: 'DZD', label: 'Dinar algérien', symbol: 'DA', decimals: 2, region: REGION_AFRICA },
    { code: 'TND', label: 'Dinar tunisien', symbol: 'DT', decimals: 3, region: REGION_AFRICA },
    { code: 'LYD', label: 'Dinar libyen', symbol: 'LD', decimals: 3, region: REGION_AFRICA },
    { code: 'EGP', label: 'Livre égyptienne', symbol: 'E£', decimals: 2, region: REGION_AFRICA },
    { code: 'SDG', label: 'Livre soudanaise', symbol: 'SDG', decimals: 2, region: REGION_AFRICA },
    { code: 'SSP', label: 'Livre sud-soudanaise', symbol: 'SSP', decimals: 2, region: REGION_AFRICA },
    { code: 'ZAR', label: 'Rand sud-africain', symbol: 'R', decimals: 2, region: REGION_AFRICA },
    { code: 'NAD', label: 'Dollar namibien', symbol: 'N$', decimals: 2, region: REGION_AFRICA },
    { code: 'BWP', label: 'Pula botswanais', symbol: 'P', decimals: 2, region: REGION_AFRICA },
    { code: 'LSL', label: 'Loti lesothan', symbol: 'L', decimals: 2, region: REGION_AFRICA },
    { code: 'SZL', label: 'Lilangeni swazi', symbol: 'E', decimals: 2, region: REGION_AFRICA },
    { code: 'ZMW', label: 'Kwacha zambien', symbol: 'ZK', decimals: 2, region: REGION_AFRICA },
    { code: 'MWK', label: 'Kwacha malawite', symbol: 'MK', decimals: 2, region: REGION_AFRICA },
    { code: 'MZN', label: 'Metical mozambicain', symbol: 'MT', decimals: 2, region: REGION_AFRICA },
    { code: 'AOA', label: 'Kwanza angolais', symbol: 'Kz', decimals: 2, region: REGION_AFRICA },
    { code: 'MUR', label: 'Roupie mauricienne', symbol: 'Rs', decimals: 2, region: REGION_AFRICA },
    { code: 'SCR', label: 'Roupie seychelloise', symbol: 'SR', decimals: 2, region: REGION_AFRICA },
    { code: 'STN', label: 'Dobra santoméen', symbol: 'Db', decimals: 2, region: REGION_AFRICA },
    { code: 'CVE', label: 'Escudo cap-verdien', symbol: 'Esc', decimals: 2, region: REGION_AFRICA },
    { code: 'ERN', label: 'Nakfa érythréen', symbol: 'Nfk', decimals: 2, region: REGION_AFRICA },
    { code: 'SOS', label: 'Shilling somalien', symbol: 'Sh', decimals: 2, region: REGION_AFRICA },
    // Europe.
    { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2, region: REGION_EUROPE },
    { code: 'GBP', label: 'Livre sterling', symbol: '£', decimals: 2, region: REGION_EUROPE },
    { code: 'CHF', label: 'Franc suisse', symbol: 'CHF', decimals: 2, region: REGION_EUROPE },
    { code: 'SEK', label: 'Couronne suédoise', symbol: 'kr', decimals: 2, region: REGION_EUROPE },
    { code: 'NOK', label: 'Couronne norvégienne', symbol: 'kr', decimals: 2, region: REGION_EUROPE },
    { code: 'DKK', label: 'Couronne danoise', symbol: 'kr', decimals: 2, region: REGION_EUROPE },
    { code: 'ISK', label: 'Couronne islandaise', symbol: 'kr', decimals: 0, region: REGION_EUROPE },
    { code: 'PLN', label: 'Zloty polonais', symbol: 'zł', decimals: 2, region: REGION_EUROPE },
    { code: 'CZK', label: 'Couronne tchèque', symbol: 'Kč', decimals: 2, region: REGION_EUROPE },
    { code: 'HUF', label: 'Forint hongrois', symbol: 'Ft', decimals: 0, region: REGION_EUROPE },
    { code: 'RON', label: 'Leu roumain', symbol: 'lei', decimals: 2, region: REGION_EUROPE },
    { code: 'BGN', label: 'Lev bulgare', symbol: 'лв', decimals: 2, region: REGION_EUROPE },
    { code: 'RSD', label: 'Dinar serbe', symbol: 'дин.', decimals: 2, region: REGION_EUROPE },
    { code: 'ALL', label: 'Lek albanais', symbol: 'L', decimals: 2, region: REGION_EUROPE },
    { code: 'MKD', label: 'Denar macédonien', symbol: 'ден', decimals: 2, region: REGION_EUROPE },
    { code: 'BAM', label: 'Mark convertible bosniaque', symbol: 'KM', decimals: 2, region: REGION_EUROPE },
    { code: 'MDL', label: 'Leu moldave', symbol: 'L', decimals: 2, region: REGION_EUROPE },
    { code: 'UAH', label: 'Hryvnia ukrainienne', symbol: '₴', decimals: 2, region: REGION_EUROPE },
    { code: 'BYN', label: 'Rouble biélorusse', symbol: 'Br', decimals: 2, region: REGION_EUROPE },
    { code: 'RUB', label: 'Rouble russe', symbol: '₽', decimals: 2, region: REGION_EUROPE },
    { code: 'TRY', label: 'Livre turque', symbol: '₺', decimals: 2, region: REGION_EUROPE },
    { code: 'GEL', label: 'Lari géorgien', symbol: '₾', decimals: 2, region: REGION_EUROPE },
    { code: 'AMD', label: 'Dram arménien', symbol: '֏', decimals: 2, region: REGION_EUROPE },
    { code: 'AZN', label: 'Manat azerbaïdjanais', symbol: '₼', decimals: 2, region: REGION_EUROPE },
    // Amérique.
    { code: 'USD', label: 'Dollar américain', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'CAD', label: 'Dollar canadien', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'MXN', label: 'Peso mexicain', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'BRL', label: 'Real brésilien', symbol: 'R$', decimals: 2, region: REGION_AMERICAS },
    { code: 'ARS', label: 'Peso argentin', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'CLP', label: 'Peso chilien', symbol: '$', decimals: 0, region: REGION_AMERICAS },
    { code: 'COP', label: 'Peso colombien', symbol: '$', decimals: 0, region: REGION_AMERICAS },
    { code: 'PEN', label: 'Sol péruvien', symbol: 'S/', decimals: 2, region: REGION_AMERICAS },
    { code: 'UYU', label: 'Peso uruguayen', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'BOB', label: 'Boliviano bolivien', symbol: 'Bs.', decimals: 2, region: REGION_AMERICAS },
    { code: 'PYG', label: 'Guarani paraguayen', symbol: '₲', decimals: 0, region: REGION_AMERICAS },
    { code: 'VES', label: 'Bolívar vénézuélien', symbol: 'Bs.', decimals: 2, region: REGION_AMERICAS },
    { code: 'GTQ', label: 'Quetzal guatémaltèque', symbol: 'Q', decimals: 2, region: REGION_AMERICAS },
    { code: 'HNL', label: 'Lempira hondurien', symbol: 'L', decimals: 2, region: REGION_AMERICAS },
    { code: 'NIO', label: 'Cordoba nicaraguayen', symbol: 'C$', decimals: 2, region: REGION_AMERICAS },
    { code: 'CRC', label: 'Colon costaricien', symbol: '₡', decimals: 2, region: REGION_AMERICAS },
    { code: 'PAB', label: 'Balboa panaméen', symbol: 'B/.', decimals: 2, region: REGION_AMERICAS },
    { code: 'DOP', label: 'Peso dominicain', symbol: 'RD$', decimals: 2, region: REGION_AMERICAS },
    { code: 'JMD', label: 'Dollar jamaïcain', symbol: 'J$', decimals: 2, region: REGION_AMERICAS },
    { code: 'TTD', label: 'Dollar de Trinité-et-Tobago', symbol: 'TT$', decimals: 2, region: REGION_AMERICAS },
    { code: 'BSD', label: 'Dollar bahaméen', symbol: 'B$', decimals: 2, region: REGION_AMERICAS },
    { code: 'BBD', label: 'Dollar barbadien', symbol: 'Bds$', decimals: 2, region: REGION_AMERICAS },
    { code: 'BZD', label: 'Dollar bélizien', symbol: 'BZ$', decimals: 2, region: REGION_AMERICAS },
    { code: 'GYD', label: 'Dollar guyanien', symbol: 'G$', decimals: 2, region: REGION_AMERICAS },
    { code: 'SRD', label: 'Dollar surinamais', symbol: '$', decimals: 2, region: REGION_AMERICAS },
    { code: 'HTG', label: 'Gourde haïtienne', symbol: 'G', decimals: 2, region: REGION_AMERICAS },
    // Asie.
    { code: 'CNY', label: 'Yuan chinois', symbol: '¥', decimals: 2, region: REGION_ASIA },
    { code: 'JPY', label: 'Yen japonais', symbol: '¥', decimals: 0, region: REGION_ASIA },
    { code: 'KRW', label: 'Won sud-coréen', symbol: '₩', decimals: 0, region: REGION_ASIA },
    { code: 'INR', label: 'Roupie indienne', symbol: '₹', decimals: 2, region: REGION_ASIA },
    { code: 'IDR', label: 'Roupie indonésienne', symbol: 'Rp', decimals: 0, region: REGION_ASIA },
    { code: 'VND', label: 'Dong vietnamien', symbol: '₫', decimals: 0, region: REGION_ASIA },
    { code: 'THB', label: 'Baht thaïlandais', symbol: '฿', decimals: 2, region: REGION_ASIA },
    { code: 'PHP', label: 'Peso philippin', symbol: '₱', decimals: 2, region: REGION_ASIA },
    { code: 'MYR', label: 'Ringgit malaisien', symbol: 'RM', decimals: 2, region: REGION_ASIA },
    { code: 'SGD', label: 'Dollar de Singapour', symbol: 'S$', decimals: 2, region: REGION_ASIA },
    { code: 'HKD', label: 'Dollar de Hong Kong', symbol: 'HK$', decimals: 2, region: REGION_ASIA },
    { code: 'TWD', label: 'Dollar taïwanais', symbol: 'NT$', decimals: 2, region: REGION_ASIA },
    { code: 'PKR', label: 'Roupie pakistanaise', symbol: '₨', decimals: 2, region: REGION_ASIA },
    { code: 'BDT', label: 'Taka bangladais', symbol: '৳', decimals: 2, region: REGION_ASIA },
    { code: 'LKR', label: 'Roupie srilankaise', symbol: 'Rs', decimals: 2, region: REGION_ASIA },
    { code: 'NPR', label: 'Roupie népalaise', symbol: 'Rs', decimals: 2, region: REGION_ASIA },
    { code: 'MMK', label: 'Kyat birman', symbol: 'K', decimals: 0, region: REGION_ASIA },
    { code: 'KHR', label: 'Riel cambodgien', symbol: '៛', decimals: 0, region: REGION_ASIA },
    { code: 'LAK', label: 'Kip laotien', symbol: '₭', decimals: 0, region: REGION_ASIA },
    { code: 'MNT', label: 'Tugrik mongol', symbol: '₮', decimals: 0, region: REGION_ASIA },
    { code: 'KZT', label: 'Tenge kazakh', symbol: '₸', decimals: 2, region: REGION_ASIA },
    { code: 'UZS', label: 'Sum ouzbek', symbol: 'so\'m', decimals: 0, region: REGION_ASIA },
    { code: 'KGS', label: 'Som kirghize', symbol: 'с', decimals: 2, region: REGION_ASIA },
    { code: 'TJS', label: 'Somoni tadjik', symbol: 'ЅМ', decimals: 2, region: REGION_ASIA },
    { code: 'TMT', label: 'Manat turkmène', symbol: 'm', decimals: 2, region: REGION_ASIA },
    { code: 'BND', label: 'Dollar de Brunei', symbol: 'B$', decimals: 2, region: REGION_ASIA },
    { code: 'MOP', label: 'Pataca macanaise', symbol: 'MOP$', decimals: 2, region: REGION_ASIA },
    { code: 'BTN', label: 'Ngultrum bhoutanais', symbol: 'Nu.', decimals: 2, region: REGION_ASIA },
    { code: 'MVR', label: 'Rufiyaa maldivienne', symbol: 'Rf', decimals: 2, region: REGION_ASIA },
    { code: 'AFN', label: 'Afghani afghan', symbol: '؋', decimals: 0, region: REGION_ASIA },
    // Moyen-Orient.
    { code: 'AED', label: 'Dirham des Émirats arabes unis', symbol: 'د.إ', decimals: 2, region: REGION_MIDDLE_EAST },
    { code: 'SAR', label: 'Riyal saoudien', symbol: '﷼', decimals: 2, region: REGION_MIDDLE_EAST },
    { code: 'QAR', label: 'Riyal qatari', symbol: 'ر.ق', decimals: 2, region: REGION_MIDDLE_EAST },
    { code: 'KWD', label: 'Dinar koweïtien', symbol: 'د.ك', decimals: 3, region: REGION_MIDDLE_EAST },
    { code: 'BHD', label: 'Dinar bahreïni', symbol: '.د.ب', decimals: 3, region: REGION_MIDDLE_EAST },
    { code: 'OMR', label: 'Rial omanais', symbol: 'ر.ع.', decimals: 3, region: REGION_MIDDLE_EAST },
    { code: 'JOD', label: 'Dinar jordanien', symbol: 'د.ا', decimals: 3, region: REGION_MIDDLE_EAST },
    { code: 'ILS', label: 'Shekel israélien', symbol: '₪', decimals: 2, region: REGION_MIDDLE_EAST },
    { code: 'LBP', label: 'Livre libanaise', symbol: 'ل.ل', decimals: 0, region: REGION_MIDDLE_EAST },
    { code: 'IQD', label: 'Dinar irakien', symbol: 'ع.د', decimals: 3, region: REGION_MIDDLE_EAST },
    { code: 'IRR', label: 'Rial iranien', symbol: '﷼', decimals: 0, region: REGION_MIDDLE_EAST },
    { code: 'SYP', label: 'Livre syrienne', symbol: '£S', decimals: 0, region: REGION_MIDDLE_EAST },
    { code: 'YER', label: 'Rial yéménite', symbol: '﷼', decimals: 0, region: REGION_MIDDLE_EAST },
    // Océanie.
    { code: 'AUD', label: 'Dollar australien', symbol: '$', decimals: 2, region: REGION_OCEANIA },
    { code: 'NZD', label: 'Dollar néo-zélandais', symbol: '$', decimals: 2, region: REGION_OCEANIA },
    { code: 'FJD', label: 'Dollar fidjien', symbol: 'FJ$', decimals: 2, region: REGION_OCEANIA },
    { code: 'PGK', label: 'Kina papouasien', symbol: 'K', decimals: 2, region: REGION_OCEANIA },
    { code: 'WST', label: 'Tala samoan', symbol: 'WS$', decimals: 2, region: REGION_OCEANIA },
    { code: 'TOP', label: "Pa'anga tongien", symbol: 'T$', decimals: 2, region: REGION_OCEANIA },
    { code: 'VUV', label: 'Vatu vanuatuan', symbol: 'VT', decimals: 0, region: REGION_OCEANIA },
    { code: 'SBD', label: 'Dollar des Îles Salomon', symbol: 'SI$', decimals: 2, region: REGION_OCEANIA },
    { code: 'XPF', label: 'Franc CFP', symbol: '₣', decimals: 0, region: REGION_OCEANIA },
  ];

  var EXPENSE_CATEGORIES = [
    { id: 'courses', label: 'Courses', icon: 'ph-bold ph-shopping-cart' },
    { id: 'repas', label: 'Repas', icon: 'ph-bold ph-fork-knife' },
    { id: 'logement', label: 'Logement', icon: 'ph-bold ph-house' },
    { id: 'transport', label: 'Transport', icon: 'ph-bold ph-car' },
    { id: 'loisirs', label: 'Loisirs', icon: 'ph-bold ph-confetti' },
    { id: 'sante', label: 'Santé', icon: 'ph-bold ph-heartbeat' },
    { id: 'autre', label: 'Autre', icon: 'ph-bold ph-receipt' },
  ];

  // Modes de répartition d'une dépense (au-delà du poids permanent des
  // profils) — cf. scripts/calc.js, computeShares.
  var SPLIT_MODES = [
    { id: 'default', label: 'Part' },
    { id: 'equal', label: 'Équitable' },
    { id: 'shares', label: 'Part ponctuelle' },
    { id: 'exact', label: 'Montant exact' },
    { id: 'percent', label: 'Pourcentage' },
  ];

  var RohyData = {
    CURRENCIES: CURRENCIES,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    SPLIT_MODES: SPLIT_MODES,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = RohyData;
  } else {
    root.RohyData = RohyData;
  }
}(typeof self !== 'undefined' ? self : this));
