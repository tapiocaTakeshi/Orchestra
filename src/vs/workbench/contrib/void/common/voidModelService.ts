import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

type VoidModelType = {
	model: ITextModel | null;
	editorModel: IResolvedTextEditorModel | null;
};

export interface IVoidModelService {
	readonly _serviceBrand: undefined;
	initializeModel(uri: URI): Promise<void>;
	getModel(uri: URI): VoidModelType;
	getModelFromFsPath(fsPath: string): VoidModelType;
	getModelSafe(uri: URI): Promise<VoidModelType>;
	saveModel(uri: URI): Promise<void>;

}

export const IVoidModelService = createDecorator<IVoidModelService>('voidVoidModelService');

class VoidModelService extends Disposable implements IVoidModelService {
	_serviceBrand: undefined;
	static readonly ID = 'voidVoidModelService';
	private readonly _modelRefOfURI: Record<string, IReference<IResolvedTextEditorModel>> = {};

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
	}

	saveModel = async (uri: URI) => {
		// 1) 通常パス: textFileService.save を使う。
		//    - テキストモデルが読み込まれていれば、エディタ上の最新内容を atomic に保存できる。
		//    - skipSaveParticipants: true で formatter 等が走って undo スタックを汚さないようにする。
		// 2) Fallback: 1) が失敗した場合 (model が未ロード／dispose 済み等)、
		//    その場で在メモリのモデル文字列を fileService 経由で直接書き出して
		//    "Failed to save" 通知を抑止する。
		try {
			const result = await this._textFileService.save(uri, {
				skipSaveParticipants: true,
				// VS Code 標準の保存エラーハンドラ (textFileSaveErrorHandler) が
				// "Failed to save '<file>': ..." の通知を出さないようにする。
				// 失敗時は下の fallback で在メモリ内容を直接書き出すため、
				// ユーザーに不要なエラー通知を見せない。
				ignoreErrorHandler: true,
			})
			if (result) return
			// 戻り値 undefined = 内部で諦めたケース → fallback へ
		} catch (e) {
			console.warn(`[VoidModelService] textFileService.save failed for ${uri.toString()}:`, e)
		}

		// Fallback: 在メモリの ITextModel から内容を取り出してファイルへ直接書き出す。
		try {
			const { model } = this.getModel(uri)
			if (model && !model.isDisposed()) {
				const text = model.getValue()
				await this._fileService.writeFile(uri, VSBuffer.fromString(text))
				console.log(`[VoidModelService] saveModel fallback: wrote ${text.length} chars to ${uri.fsPath}`)
				return
			}
			// model がない場合はサイレントに諦める（reject/discard 経路では既にメモリ整合は取れているため）。
			console.warn(`[VoidModelService] saveModel fallback skipped: no in-memory model for ${uri.fsPath}`)
		} catch (e) {
			console.error(`[VoidModelService] saveModel fallback write failed for ${uri.toString()}:`, e)
		}
	}

	initializeModel = async (uri: URI) => {
		try {
			if (uri.fsPath in this._modelRefOfURI) return;

			// check if file exists
			const exists = await this._fileService.exists(uri);
			if (!exists) return;

			const editorModelRef = await this._textModelService.createModelReference(uri);
			// Keep a strong reference to prevent disposal
			this._modelRefOfURI[uri.fsPath] = editorModelRef;
		}
		catch (e) {
			console.log('InitializeModel error:', e)
		}
	};

	getModelFromFsPath = (fsPath: string): VoidModelType => {
		const editorModelRef = this._modelRefOfURI[fsPath];
		if (!editorModelRef) {
			return { model: null, editorModel: null };
		}

		const model = editorModelRef.object.textEditorModel;

		if (!model) {
			return { model: null, editorModel: editorModelRef.object };
		}

		return { model, editorModel: editorModelRef.object };
	};

	getModel = (uri: URI) => {
		return this.getModelFromFsPath(uri.fsPath)
	}


	getModelSafe = async (uri: URI): Promise<VoidModelType> => {
		if (!(uri.fsPath in this._modelRefOfURI)) await this.initializeModel(uri);
		return this.getModel(uri);

	};

	override dispose() {
		super.dispose();
		for (const ref of Object.values(this._modelRefOfURI)) {
			ref.dispose(); // release reference to allow disposal
		}
	}
}

registerSingleton(IVoidModelService, VoidModelService, InstantiationType.Eager);
