6 件のファイルが見つかりました（キーワード: 既存, ui, 要約再調査）。

### `.build/extensions/theme-quietlight/themes/quietlight-color-theme.json`
```json
{"name":"Quiet Light","tokenColors":[{"settings":{"foreground":"#333333"}},{"scope":["meta.embedded","source.groovy.embedded","string meta.image.inline.markdown","variable.legacy.builtin.python"],"settings":{"foreground":"#333333"}},{"name":"Comments","scope":["comment","punctuation.definition.comment"],"settings":{"fontStyle":"italic","foreground":"#AAAAAA"}},{"name":"Comments: Preprocessor","scope":"comment.block.preprocessor","settings":{"fontStyle":"","foreground":"#AAAAAA"}},{"name":"Comments: Documentation","scope":["comment.documentation","comment.block.documentation","comment.block.documentation punctuation.definition.comment "],"settings":{"foreground":"#448C27"}},{"name":"Invalid","scope":"invalid","settings":{"foreground":"#cd3131"}},{"name":"Invalid - Illegal","scope":"invalid.illegal","settings":{"foreground":"#660000"}},{"name":"Operators","scope":"keyword.operator","settings":{"foreground":"#777777"}},{"name":"Keywords","scope":["keyword","storage"],"settings":{"foreground":"#4B69C6"}},{"name":"Types","scope":["storage.type","support.type"],"settings":{"foreground":"#7A3E9D"}},{"name":"Language Constants","scope":["constant.language","support.constant","variable.language"],"settings":{"foreground":"#9C5D27"}},{"name":"Variables","scope":["variable","support.variable"],"settings":{"foreground":"#7A3E9D"}},{"name":"Functions","scope":["entity.name.function","support.function"],"settings":{"fontStyle":"bold","foreground":"#AA3731"}},{"name":"Classes","scope":["entity.name.type","entity.name.namespace","entity.name.scope-resolution","entity.other.inherited-class","punctuation.separator.namespace.ruby","support.class"],"settings":{"fontStyle":"bold","foreground":"#7A3E9D"}},{"name":"Exceptions","scope":"entity.name.exception","settings":{"foreground":"#660000"}},{"name":"Sections","scope":"entity.name.section","settings":{"fontStyle":"bold"}},{"name":"Numbers, Characters","scope":["constant.numeric","constant.character","constant"],"settings":{"foreground":"#9C5D27"}},{"name":"Strings","scope":"string","settings":{"foreground":"#448C27"}},{"name":"Strings: Escape Sequences","scope":"constant.character.escape","settings":{"foreground":"#777777"}},{"name":"Strings: Regular Expressions","scope":"string.regexp","settings":{"foreground":"#4B69C6"}},{"name":"Strings: Symbols","scope":"constant.other.symbol","settings":{"foreground":"#9C5D27"}},{"name":"Punctuation","scope":"punctuation","settings":{"foreground":"#777777"}},{"name":"HTML: Doctype Declaration","scope":["meta.tag.sgml.doctype","meta.tag.sgml.doctype string","meta.tag.sgml.doctype entity.name.tag","meta.tag.sgml punctuation.definition.tag.html"],"settings":{"foreground":"#AAAAAA"}},{"name":"HTML: Tags","scope":["meta.tag","punctuation.definition.tag.html","punctuation.definition.tag.begin.html","punctuation.definition.tag.end.html"],"settings":{"foreground":"#91B3E0"}},{"name":"HTML: Tag Names","scope":"entity.name.tag","settings":{"foreground":"#4B69C6"}},{"name":"HTML: Attribute Names","scope":["meta.tag entity.other.attribute-name","entity.other.attribute-name.html"],"settings":{"fontStyle":"italic","foreground":"#8190A0"}},{"name":"HTML: Entities","scope":["constant.character.entity","punctuation.definition.entity"],"settings":{"foreground":"#9C5D27"}},{"name":"CSS: Selectors","scope":["meta.selector","meta.selector entity","meta.selector entity punctuation","entity.name.tag.css","entity.name.tag.less"],"settings":{"foreground":"#7A3E9D"}},{"name":"CSS: Property Names","scope":["meta.property-name","support.type.property-name"],"settings":{"foreground":"#9C5D27"}},{"name":"CSS: Property Values","scope":["meta.property-value","meta.property-value constant.other","support.constant.property-value"],"settings":{"foreground":"#448C27"}},{"name":"CSS: Important Keyword","scope":"keyword.other.important","settings":{"fontStyle":"bold"}},{"name":"Markup: Changed","scope":"markup.changed","settings":{"foreground":"#000000"}},{"name":"Markup: Deletion","scope":"markup.deleted","settings":{"foreground":"#000000"}},{"name":"Markup: Emphasis","scope":"markup.italic","settings":{"fontStyle":"italic"}},{"scope":"markup.strikethrough","settings":{"fontStyle":"strikethrough"}},{"name":"Markup: Error","scope":"markup.error","settings":{"foreground":"#660000"}},{"name":"Markup: Insertion","scope":"markup.inserted","settings":{"foreground":"#000000"}},{"name":"Markup: Link","scope":"meta.link","settings":{"foreground":"#4B69C6"}},{"name":"Markup: Output","scope":["markup.output","markup.raw"],"settings":{"foreground":"#777777"}},{"name":"Markup: Prompt","scope":"markup.prompt","settings":{"foreground":"#777777"}},{"name":"Markup: Heading","scope":"markup.heading","settings":{"foreground":"#AA3731"}},{"name":"Markup: Strong","scope":"markup.bold","settings":{"fontStyle":"bold"}},{"name":"Markup: Traceback","scope":"markup.traceback","settings":{"foreground":"#660000"}},{"name":"Markup: Underline","scope":"markup.underline","settings":{"fontStyle":"underline"}},{"name":"Markup Quote","scope":"markup.quote","settings":{"foreground":"#7A3E9D"}},{"name":"Markup Lists","scope":"markup.list","settings":{"foreground":"#4B69C6"}},{"name":"Markup Styling","scope":["markup.bold","markup.italic"],"settings":{"foreground":"#448C27"}},{"name":"Markup Inline","scope":"markup.inline.raw","settings":{"fontStyle":"","foreground":"#9C5D27"}},{"name":"Extra: Diff Range","scope":["meta.diff.range","meta.diff.index","meta.separator"],"settings":{"foreground":"#434343"}},{"name":"Extra: Diff From","scope":["meta.diff.header.from-file","punctuation.definition.from-file.diff"],"settings":{"foreground":"#4B69C6"}},{"name":"Extra: Diff To","scope":["meta.diff.header.to-file","punctuation.definition.to-file.diff"],"settings":{"foreground":"#4B69C6"}},{"name":"diff: deleted","scope":"markup.deleted.diff","settings":{"foreground":"#C73D20"}},{"name":"diff: changed","scope":"markup.changed.diff","settings":{"foreground":"#9C5D27"}},{"name":"diff: inserted","scope":"markup.inserted.diff","settings":{"foreground":"#448C27"}},{"name":"JSX: Tags","scope":["punctuation.definition.tag.js","punctuation.definition.tag.begin.js","punctuation.definition.tag.end.js"],"settings":{"foreground":"#91B3E0"}},{"name":"JSX: InnerText","scope":"meta.jsx.c

... [中略 52931 文字省略] ...

nnelApplicationConfig" => {
				if let Value::Object(v) = value {
					set_env_vars_from_map_keys(&format!("{}_{}", prefix, "TUNNEL"), v);
				}
				continue;
			}
			_ => value,
		};
		if key.contains("win32") && key.contains("AppId") {
			if let Value::String(s) = value {
				win32_app_ids.push(s);
				continue;
			}
		}
		//#endregion

		if let Value::String(s) = value {
			println!(
				"cargo:rustc-env={}_{}={}",
				prefix,
				camel_case_to_constant_case(&key),
				s
			);
		}
	}

	if !win32_app_ids.is_empty() {
		println!(
			"cargo:rustc-env=VSCODE_CLI_WIN32_APP_IDS={}",
			win32_app_ids.join(",")
		);
	}
}

fn read_json_from_path<T>(path: &Path) -> T
where
	T: DeserializeOwned,
{
	let mut file = fs::File::open(path).expect("failed to open file");
	serde_json::from_reader(&mut file).expect("failed to deserialize JSON")
}

fn apply_build_from_product_json(path: &Path) {
	let json: HashMap<String, Value> = read_json_from_path(path);
	set_env_vars_from_map_keys("VSCODE_CLI", json);
}

#[derive(Deserialize)]
struct PackageJson {
	pub version: String,
}

fn apply_build_environment_variables() {
	let repo_dir = env::current_dir().unwrap().join("..");
	let pa
... (truncated)
```
