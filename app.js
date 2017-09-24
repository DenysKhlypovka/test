var mong  = require("mongodb").MongoClient;
var url = "mongodb://heroku_ldt1pmmh:n2rd6j7d3k2timf0ueefbdkcub@ds149124.mlab.com:49124/heroku_ldt1pmmh"

var express = require("express");
var app = express();

var bodyPars = require("body-parser");
var jsonParser = bodyPars.json();

var arr = require('dynamic-array').DynamicArray();


//спочатку хотів додати коментарі по-англійськи, але нічого не вийшло, тому написав як міг ¯\_(ツ)_/¯


//реалізація зв'язків батьківська компанія-дочірня компанія реалізується за допомогою Model Tree Structures with Nested Sets
//разом із збереженням у кожній компанії масиву ідентифікаторів дочірніх компаній 


app.use(bodyPars.urlencoded({extended: false}));
app.use(bodyPars.json());

app.get("/", function(req, res){
	
	 res.sendFile("/index.html", {root: __dirname });
});

app.post("/new", jsonParser, function(req, res){

	let name = req.body.name.trim();
	let earn = req.body.earn;
	let parent = req.body.parent.trim();
	let parentID = null;

	//перевірка на правильність заповнення полів
	if (earn == "" || isNaN(earn)) return res.json("Invalid value (Estimated Earnings)");
	if (name == parent) return res.json("Company with the same name already exists (" + name + ")");

	mong.connect(url, function(err, db){


		db.createCollection("companies");

		if (err) 
		    throw err;
		else 
		    console.log('Connection established to', url);
		let left = 0
		let right;	
		
			db.collection("companies").findOne({"name": parent}, function(err, result){

				if (parent != "") {
					if (result == null) return res.json("There is no such company in the DB (" + parent + ")");
					else {
						parentID = result._id;				//значення right та left нової компанії завжди залежатимуть від 
						left = result.left;					//відповідних значень батьківської компанії
					}
				}
				else {
					db.collection("companies").aggregate([				
					{ $group:
					    {_id:null, 
					        Max:{$max: "$right"}}}], function(err, data){
					        	if (data[0]) {								//визначення максимального значення right 
					        		left = data[0].Max;						//яке буде присвоюватись новій компанії
					        	}					        				//у разі відсутності батьківської компанії
					        });
				}

				db.collection("companies").findOne({"name": name}, function(err, result){

		            if (result ) return res.json("Company with the same name already exists (" + name + ")");

					left = left + 1;
					right = left + 1;

		            db.collection("companies").updateMany(
						{"right": {$gt: left - 1}},
						{$inc: {"right": 2}}, function(){			//коригування значень left та right компаній відповідно до змін у базі
						
					    db.collection("companies").updateMany(
					    	{"left": {$gt: left - 1}},
					    	{$inc: {"left": 2}}, function(){
					    	
							db.collection("companies").insertOne({"name": name, "earn": Number(earn), "left": left, "right": right}, function(err, result){

								res.json("Company " + name + " has been added");	//відповідь сервера

						        if (parentID != null)					//занесення ідентифікатора дочірньої компанії в поле ChildID батьківської
									db.collection("companies").update(
										{_id: parentID}, 
										{$push : { "childID": result.insertedId}}, { _id: false });	
					        
						});
				    });
				});
			});
		});
	});
});

app.put("/update", jsonParser, function(req, res){

	var oldName = req.body.oldName.trim();
	var name = req.body.name.trim();
	var earn = req.body.earn;
	var parent = req.body.parent.trim();

	let right, left;

	//перевірка правильності введення полів
	if (isNaN(earn)) return res.json("Invalid value (Estimated Earnings)");
	if (oldName == "") return res.json("Invalid value (Company Name)");
	if (oldName == parent) return res.json("Invalid value (Parent Company)");

	mong.connect(url, function(err, db){
		
		db.collection("companies").findOne({"name": name}, function(err, results){

            if (results) return res.json("Company with the same name already exists (" + name + ")");
		
			db.collection("companies").findOne({"name": oldName}, function(err, resultOldName){

				right = resultOldName.right;		//значення left та right компанії, яку змінюють
				left = resultOldName.left;
				
	            if (!resultOldName) return res.json("There is no such company in the DB (" + oldName + ")");

				if (name == "") name = resultOldName.name;		//якщо у формі не було заповнено одного з полів, то вважаємо, що там залишаються старі дані
				if (earn == "") earn = resultOldName.earn;	
				var compId = resultOldName._id;	

				db.collection("companies").findOne({"name": parent}, function(err, resultParent){

					if (!resultParent && parent != "") return res.json("There is no such company in the DB (" + parent + ")");		           

					if (resultParent != null){		//якщо при зміні було вказано нову компанію
													//у базі відбудуться відповідні зміни значень right та left, де це необхідно
						let multip;
						let newRight, newLeft;
						let min, max;

						if (resultParent.left > left) {		//встановлення усіх допоміжних змінних
							multip = -2;
							newRight = resultParent.right - 1;
							newLeft = newRight - 1;
							min = left;
							max = newRight;
						}
						else {
							multip = 2;
							newLeft = resultParent.left + 1;
							newRight = newLeft + 1;
							max = right;
							min = newLeft;
						}

						db.collection("companies").updateMany(
							{$and: [{"left": {$gte: min}}, {"left": {$lte: max}}]},
							{$inc: {"left": multip}},function(err, result){

							db.collection("companies").updateMany(
								{$and: [{"right": {$gte: min}}, {"right": {$lte: max}}]},
								{$inc: {"right": multip}},function(err, result){

								if(left != right - 1){		//якщо компанія, яку змінюють, має дочірні компанії, 
															//то значення їх полів left та right теж треба змінити
									db.collection("companies").updateMany(
									{$and: 
										[{$and: 
											[{"left": {$gt: (left + multip)}}, {"left": {$lt: (right + multip)}}]},
										{ $and:	
											[{"right": {$gt: (left + multip)}}, {"right": {$lt: (right + multip)}}]}]},
									{$inc: {"right": - multip / 2, "left": - multip / 2}})
								}
																							//редагування полів left та right компанії, яку змінюють
							db.collection("companies").findOneAndUpdate({"name": oldName}, {$set:{"left": newLeft, "right": newRight}})	

							});
						});
					            	
	            	}

	            	else {		//якщо у компанії немає дочірніх компаній, то поля right та left для усіх інших компаній змінюють іншим чином
	            		if(left != right - 1)
							db.collection("companies").updateMany(
							{$and: [{"right": {$gt: left}}, {"right": {$lt: right}}]},
							{$inc: {"right": -1, "left": -1}},function(err, result){
							
		            		db.collection("companies").updateMany({
		            			"left": {$gt: right}},
								{$inc: {"left": -2}},function(err, result){
							
			            		db.collection("companies").updateMany({
			            			"right": {$gt: right}},
									{$inc: {"right": -2}},function(err, result){
									
										db.collection("companies").aggregate([				//	редагування полів left та right компанії, яку змінюють
									{ $group:
									    {_id:null, 
									        Max:{$max: "$right"}}}], function(err, data){
						            			db.collection("companies").findOneAndUpdate(
												   { "name" : oldName },
												   { $set: { "left" : data[0].Max + 1, "right" : data[0].Max + 2}})
	            				});
	            			});
	            		});
	            	});
	            		
	            	}
	            	db.collection("companies").findOne({"childID": compId}, function(err, resultParentOld){

	            		if (resultParentOld != null)
	            		db.collection("companies").update(		//видалення ідентифікатора компанії, яку змінюють, з поля ChildID старої батьківської компанії, якщо остання була змінена
		            		{"_id": resultParentOld._id},
		            		{$pull: {"childID": compId}});

						if (resultParent != null)
						db.collection("companies").findOneAndUpdate(			//додавання ідентифікатора компанії, яку змінюють, у поле ChildID нової батьківської компанії, якщо остання була змінена
		            		{_id: resultParent._id},			
		            		{$push : { "childID": compId}}, function(err, result){
		            			if (err) throw err;
		            		}); 	

						db.collection("companies").findOneAndUpdate({"name": oldName}, { $set: {"name": name, "earn": Number(earn)}}, function(err, result){
								res.json("Company " + oldName + " has been updated (" + name + ", " + earn + "K)");
			
			        	});
					});
				});
	        });
        });
	});
});

app.get("/view/:name", function(req, res){

	var name = req.params.name.trim();
	
	mong.connect(url, function(err, db){

		db.collection("companies").findOne({"name": name}, function(err, result){

			if (result == null) return res.json("There is no such company in the DB (" + name + ")");	//перевірка, чи компанія є у базі

			let children = String("");

			arr.clear();

			if (!result.childID) res.json("Company Name: " + result.name + "; Estimated Earnings: " + result.earn + "K; Child Companies: none; Total Estimated Earnings: " + result.earn + "K.")	//якщо у даної компанії немає дочірнії компаній
			else {

				let Sum;

				db.collection("companies").aggregate([
				{$match:
				  {$or:
				      [{ $and:
				          [{ left: {$gt: result.left}}, {left: {$lt: result.right}}]},
				      { $and:
				          [{ right: {$gt: result.left}}, {right: {$lt: result.right}}]}]	//запит, який знаходить суму значень Estimated Earnings
				}},																			//усіх дочірніх та вкладених дочірніх компаній
				{ $group:
				    {_id:null, 
				        Sum:{$sum: "$earn"}}}], function(err, data){
				        	if (data[0])
				        	Sum = data[0].Sum;
				        });

				let array = result.childID;				//стрічка, яка містить ідентифікатори дочірніх компаній даної

				array.forEach(function(item, i, ar){	//перетворення стрічки у масив

					arr.push(item);
				});

				var F = function(callback){		//функція, яка перетворює масив ідентифікаторів компаній в стрічку їх назв

					let itemsProcessed = 0;

					arr.each(function(item){

						db.collection("companies").findOne({_id: item}, function(err, result){

							itemsProcessed++;					//counter, який підраховує кількість ітерацій

							if (result.name)
								children = children + result.name + ", ";

							if (itemsProcessed == arr.size()) 	//коли дораховує до кінця, викликає callback-функцію
								callback(children);

						});
					});
				}

				F(function(children){

					res.json("Company Name: " + result.name + "; Estimated Earnings: " + result.earn + "K; Child Companies: " + children.slice(0, children.length - 2) + "; Total Estimated Earnings: " + Sum + "K.");
				}); 	
			}
		});
	});
});

app.delete("/delete/:id", function(req, res){

	let name = req.params.id.trim();
	let left, right;

	mong.connect(url, function(err, db){

	        db.collection("companies").findOneAndDelete({"name": name}, function(err, result){
         	
	            if (!result.value) return res.json("There is no such company in the DB (" + name + ")");	//чи існує документ з такими даними у базі

	            left = result.value.left;
	            right = result.value.right;

	            db.collection("companies").updateMany(			//запити, які вносять зміни у значення right та left
							{"right": {$gt: right}},			//компаній у базі, відповідно до внесених змін(видалення однієї з компаній)
							{$inc: {"right": -1}}
							);

	            db.collection("companies").updateMany(
							{"left": {$gt: right}},
							{$inc: {"left": -1}}
							);

	            db.collection("companies").updateMany(
							{"left": {$gt: left}},
							{$inc: {"left": -1}}
							);

	            db.collection("companies").updateMany(
							{"right": {$gt: left}},
							{$inc: {"right": -1}}
							);

	            var deletedID = result.value._id;
	            var deletedChildren = [];
	            if (result.value.childID != "") deletedChildren = result.value.childID;		//тимчасова змінна для збереження ідентифікаторів дочірніх елементів, якщо такі є

	   			res.json("Company " + name + " has been deleted");		//відповідь сервера

	            db.collection("companies").findOne({"childID": deletedID}, function(err, results){	//знахождення батьківської компанії

	            	if (results == null) return;
					if (deletedChildren == null) return;

	            	db.collection("companies").update(		
	            		{"_id": results._id},				//видалення ідентифікатора компанії, яку видалили
	            		{$pull: {"childID": deletedID}}); 

	            	db.collection("companies").update(		
	            		{"_id": results._id},			//перенесення ідентифакторів дочірніх компаній видаленої компанії до батьківської			
	            		{$push: {"childID": { $each: deletedChildren }}});
            	
	        });
		});
	});
});

app.get("/tree", function(req, res){

	mong.connect(url, function(err, db){

		db.collection("companies").aggregate([				
			{ $group:
			    {_id:null, 
			        Max:{$max: "$right"}}}], 		//знаходиться максимальне значення right для for-циклу
			function(err, data){

				if (err) throw err;

				let Max;

	        	if (data[0]) 
	        		Max = data[0].Max;
				else return res.json("No companies detected");	//якщо результат негативний, це означає, що база пуста

				let level = "-";
				let lastRight = -2;
				let lastLeft = -2;
				let treeString = "<br/>";

				var InitTree = function(counter){			//рекурсивна функція, яка визначає рівні вкладеності усіх компаній

					db.collection("companies").findOne({
						$or: [
						{"right": counter},		//всередині функції лічильник counter інкрементується з кожним наступним викликом функції самої себе 
						{"left": counter}]		//запит, який шукає елемент, відповідно до лічильника
					}, function(err, result){

						if (result == undefined || result == undefined) return;

						db.collection("companies").aggregate([		//запит, який для кожної компанії шукає суму значень Earnings усіх вкладених компаній
						{$match:
						  {$or:
						      [{ $and:
						          [{ "left": {$gt: result.left}}, {"left": {$lt: result.right}}]},
						      { $and:
						          [{ "right": {$gt: result.left}}, {"right": {$lt: result.right}}]}]
						}},
						{ $group:
						    {_id:null, 
						        Sum:{$sum: "$earn"}}}], function(err, data){

						        	if (err) throw err;
									
						        	let left = result.left;
									let right = result.right;
									let output = result.name;
									let total = 0;
																			//через специфіку моделі даних, бувають випадки, коли компанія матиме значення
									if (lastLeft != result.left){			//left, яке на 1 менше, ніж right, і тому викликатиметься 2 рази підряд
																			
										if (result.right == lastRight + 1) {		//коли рівень вкладеності зменшується на 1
											level = level.slice(0, level.length - 1);	

											lastLeft = result.left;
											lastRight = result.right;
										}
										else{
											if (result.left == lastLeft + 1) {		//коли рівень вкладеності збільшується на 1
												level = level + "-";
											}
																	//treeString збирає результати виконання кожної ітерації
											treeString = treeString + (level + "Company Name: " + result.name + "; Estimated Earnings: " + result.earn + "; Total Estimated Earnings: ");
											
											if(!result.childID)  
												treeString = treeString + result.earn;		//якщо дочірніх компаній немає, то сумарний прибуток 
																							//рівний прибутку тільки цієї компанії
											else{
								        	if (data[0]) 					
								        		total = data[0].Sum;						//в іншому випадку сумарний прибуток буде рівним прубутку
								        	treeString = treeString + (result.earn + total);//даної компанії + сумарний прибуток усіх вкладених, який
								        													//розраховувався вище
								        	}
											treeString = treeString + "<br/>";				//кожна нова компанія - з абзацу
						        	}}

									lastLeft = result.left;					//збереження останніх значень left та right для наступних ітерацій
									lastRight = result.right; 
						       		if (counter < Max + 1)	{	//якщо лічильник не досягнув максимуму, функція знов себе викликає 
						       			InitTree(counter + 1);
						       		}
						       		if(counter == Max)
						       			res.json(treeString);	//в іншому випадку сервер повертає результативну стрічку

						       		if(counter > Max)
										res.json("error");		
						       		
						        });
					});
				}
			InitTree(1);	

	    });
	});
});

app.listen(process.env.PORT || 5000);