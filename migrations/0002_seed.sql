INSERT INTO profile (id, content) VALUES (1, '');

INSERT INTO sources (kind, tier, label, provider, token) VALUES
('query', 'discovery', 'Product Manager · Berlin 50km', 'arbeitsagentur', 'was=Product+Manager&wo=Berlin&umkreis=50&angebotsart=1&pav=false'),
('query', 'discovery', 'Product Owner · Berlin 50km', 'arbeitsagentur', 'was=Product+Owner&wo=Berlin&umkreis=50&angebotsart=1&pav=false'),
('query', 'discovery', 'Technical Product Manager · Berlin 50km', 'arbeitsagentur', 'was=Technical+Product+Manager&wo=Berlin&umkreis=50&angebotsart=1&pav=false'),
('query', 'discovery', 'Senior Product Manager · Berlin 50km', 'arbeitsagentur', 'was=Senior+Product+Manager&wo=Berlin&umkreis=50&angebotsart=1&pav=false'),
('query', 'discovery', 'AI Product Manager · Berlin 50km', 'arbeitsagentur', 'was=AI+Product+Manager&wo=Berlin&umkreis=50&angebotsart=1&pav=false'),
('query', 'discovery', 'Product Manager · homeoffice', 'arbeitsagentur', 'was=Product+Manager&angebotsart=1&pav=false&arbeitszeit=ho'),
('query', 'discovery', 'Product Owner · homeoffice', 'arbeitsagentur', 'was=Product+Owner&angebotsart=1&pav=false&arbeitszeit=ho'),
('query', 'discovery', 'Senior Product Manager · homeoffice', 'arbeitsagentur', 'was=Senior+Product+Manager&angebotsart=1&pav=false&arbeitszeit=ho'),
('query', 'discovery', 'Arbeitnow product filter', 'arbeitnow', 'product');
